import path from "path";
import { Readable } from "stream";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  SESClient,
  SendEmailCommand,
  SendEmailRequest,
} from "@aws-sdk/client-ses";
import AdmZip from "adm-zip";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import * as mime from "mime-types";
import sharp from "sharp";

// Constants
const compositeImageKeyWhite = "processed_LDARBranding-white.png";
const compositeImageKeyBlack = "processed_LDARBranding-black.png";
const width = 1400;
const height = 1400;

// Initialize AWS services
const s3 = new S3Client({});
const ses = new SESClient({});

// Lambda handler function
export const handler = async (
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  try {
    const { results, email, zipKey } = await processRequest(event);
    await sendEmail(results, email, zipKey);
    const htmlContent = generateEmailHtml(results, zipKey);
    return generateResponse(200, htmlContent);
  } catch (error: any) {
    console.error(error);
    return generateResponse(
      500,
      `<h1>Error processing request</h1><p>${error.message}</p>`
    );
  }
};

const sendEmail = async (results: any[], email: string, zipKey: string) => {
  const htmlContent = generateEmailHtml(results, zipKey);
  const params: SendEmailRequest = {
    Source: process.env.EMAIL_SENDER || "your-sender-email@example.com",
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Subject: {
        Data: "P6 LDAR Pet Image Branding Results: Success",
      },
      Body: {
        Html: {
          Data: htmlContent,
        },
      },
    },
  };

  try {
    const command = new SendEmailCommand(params);
    await ses.send(command);
    console.log("Email sent successfully");
  } catch (error) {
    console.error("Failed to send email:", error);
  }
};

const generateEmailHtml = (results: any[], zipKey: string): string => {
  let html = "<html><body>";

  if (zipKey !== "") {
    const zipUrl = generateS3Url(
      process.env.BRAND_IMAGE_BUCKET ?? "p6-dne",
      zipKey
    );
    html += '<div style="margin-top: 20px;">';
    html += "<h3>Download Zip File</h3>";
    html += `<a href="${zipUrl}">${zipUrl}</a><br/>`;
    html += "</div><br/>";
  }

  for (const result of results) {
    html += '<div style="display: flex;">';
    html += '<div style="flex: 1;">';
    html += "<h3>Original Image</h3>";
    html += `<a href="${result.originalUrl}">${result.originalUrl}</a><br/>`;
    html += `<a href="${result.originalUrl}">`;
    html += `<img src="${result.originalUrl}" alt="Original Image" style="max-width: 400px;"/><br/>`;
    html += "</a>";
    html += "</div>";

    html += '<div style="flex: 1;">';
    html += "<h3>Processed Image</h3>";
    html += `<a href="${result.processedUrl}">${result.processedUrl}</a><br/>`;
    html += `<a href="${result.processedUrl}">`;
    html += `<img src="${result.processedUrl}" alt="Processed Image" style="max-width: 400px;"/><br/>`;
    html += "</a>";
    html += "</div>";
    html += "</div>";
  }

  html += "</body></html>";

  return html;
};

// Process the incoming request
const processRequest = async (
  event: APIGatewayProxyEvent
): Promise<{ results: any[]; email: string; zipKey: string }> => {
  const body = JSON.parse(event.body || "{}");
  const filename = body.image;
  const email = body.email;

  const buffer = await downloadFromS3(filename);
  const files = await extractFiles(buffer, filename);

  console.log("Processing files");
  const results = await Promise.all(files.map(processFile));
  console.log("Finished processing files");

  if (filename.endsWith(".zip")) {
    const zipBuffer = await zipFiles(results);
    const zipKey = generateKey("processed_files.zip", "package");
    await uploadToS3(
      process.env.BRAND_IMAGE_BUCKET ?? "p6-dne",
      zipKey,
      zipBuffer
    );
    return {
      results,
      email,
      zipKey,
    };
  } else {
    return { results, email, zipKey: "" };
  }
};

// Zip the processed files
const zipFiles = async (results: any[]): Promise<Buffer> => {
  console.log("Zipping files");
  const zip = new AdmZip();

  for (const result of results) {
    const bucketKey = result.processedUrl.substring(
      result.processedUrl.indexOf(".com/") + 5
    );
    const filename = bucketKey.split("/").pop();
    const fileContent = await downloadFromS3(bucketKey);
    console.log(
      `Zipping ${bucketKey} as ${filename} from ${result.processedUrl}`
    );
    zip.addFile(filename, fileContent);
  }

  return zip.toBuffer();
};

// Extract files from the request
const extractFiles = async (
  contents: Buffer,
  filename: string
): Promise<{ content: Buffer; filename: string }[]> => {
  const allowedFileTypes = [
    "application/zip",
    "image/gif",
    "image/jpeg",
    "image/png",
  ];
  const fileType = mime.lookup(filename);
  if (fileType !== false) {
    if (!allowedFileTypes.includes(fileType)) {
      throw new Error("Unsupported file type");
    }
  }

  if (filename.endsWith(".zip")) {
    return extractFilesFromZip(contents);
  } else {
    return [{ content: contents, filename: filename }];
  }
};

// Extract files from a zip archive
const extractFilesFromZip = async (zipFileContent: Buffer): Promise<any> => {
  const zip = new AdmZip(zipFileContent);
  const entries = zip.getEntries();
  const extractedFiles = [];

  for (const entry of entries) {
    if (entry.isDirectory || entry.entryName.includes("__MACOSX")) continue;
    const extension = path.extname(entry.entryName).toLowerCase();
    if (![".jpg", ".gif", ".png"].includes(extension)) continue;

    const filename = entry.entryName;
    const content = entry.getData();

    const extractedFile = {
      content,
      filename,
      contentType: "",
      encoding: "",
      fieldname: "",
    };

    extractedFiles.push(extractedFile);
  }

  return extractedFiles;
};

// Process a single file
const processFile = async (file: {
  content: Buffer;
  filename: string;
}): Promise<any> => {
  console.log("Processing file:", file.filename);
  const processedFile = await processImage(file.content);

  const bucket = process.env.BRAND_IMAGE_BUCKET ?? "p6-dne";
  const originalKey = generateKey(file.filename, "original");
  const processedKey = generateKey(file.filename, "processed");
  await uploadToS3(bucket, originalKey, file.content);
  await uploadToS3(bucket, processedKey, processedFile);

  const originalUrl = generateS3Url(bucket, originalKey);
  const processedUrl = generateS3Url(bucket, processedKey);

  return {
    originalUrl,
    processedUrl,
  };
};

// Process the image (resize and watermark)
const processImage = async (content: Buffer): Promise<Buffer> => {
  console.log("Processing Image...");
  const image = sharp(content);
  const resizedBuffer = await resizeImage(image);
  const processedBuffer = await addWatermark(resizedBuffer);

  return processedBuffer;
};

// Resize the image to the desired dimensions
const resizeImage = async (image: sharp.Sharp): Promise<Buffer> => {
  console.log("Resizing Image....");
  return image
    .resize({
      fit: sharp.fit.inside,
      width,
      height,
    })
    .toBuffer();
};

// A utility function to handle caching
const watermarkCache: { [key: string]: Buffer } = {}; // Define the cache object
const getWatermarkBuffer = async (key: string): Promise<Buffer> => {
  if (watermarkCache[key]) {
    // If the watermark is in cache, use that
    return watermarkCache[key];
  } else {
    // If not, download it, put it in the cache, and return it
    const buffer = await downloadFromS3(key);
    watermarkCache[key] = buffer;
    return buffer;
  }
};

// Add the watermark to the image
const addWatermark = async (imageBuffer: Buffer): Promise<Buffer> => {
  console.log("Adding WaterMark...");
  const watermarkKey = await getWatermarkKey(imageBuffer);
  const watermarkBuffer = await getWatermarkBuffer(watermarkKey);
  const { width: imageWidth, height: imageHeight } = await sharp(
    imageBuffer
  ).metadata();
  const { width: watermarkWidth, height: watermarkHeight } = await sharp(
    watermarkBuffer
  ).metadata();

  // Position adjustment based on watermark color
  let left = (imageWidth ?? 0) - (watermarkWidth ?? 0) + 25;
  let top = (imageHeight ?? 0) - (watermarkHeight ?? 0) + 45;

  // Adjust position if the watermark is white
  if (watermarkKey === compositeImageKeyWhite) {
    left -= 30;
    top -= 40;
  }

  // Adjust position if the watermark is black
  if (watermarkKey === compositeImageKeyBlack) {
    top -= 50;
  }

  console.log(`Watermark position: ${left}, ${top}`);
  return sharp(imageBuffer)
    .composite([{ input: watermarkBuffer, left, top }])
    .toBuffer();
};

// Get the watermark key based on image luminance
const getWatermarkKey = async (imageBuffer: Buffer): Promise<string> => {
  const { dominant } = await sharp(imageBuffer).stats();
  const { r, g, b } = dominant;
  const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  const key = luminance < 0.5 ? compositeImageKeyWhite : compositeImageKeyBlack;
  console.log(`Watermark key: ${key}`);
  return key;
};

// Generate an S3 URL for the given bucket and key
const generateS3Url = (bucket: string, key: string): string => {
  const url = `https://${bucket}.s3.amazonaws.com/${key}`;
  console.log(`Generated S3 URL: ${url}`);
  return url;
};

// Upload a file to S3
const uploadToS3 = async (
  bucket: string,
  key: string,
  content: Buffer
): Promise<void> => {
  console.log(`Uploading ${bucket}/${key}`);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: content,
  });
  await s3.send(command);
};

// Download a file from S3
const downloadFromS3 = async (key: string): Promise<Buffer> => {
  const bucket = process.env.BRAND_IMAGE_BUCKET ?? "p6-dne";
  const params = {
    Bucket: bucket,
    Key: key,
  };
  console.log(`Downloading ${bucket}/${key}`);
  const command = new GetObjectCommand(params);
  let response = await s3.send(command);
  if (!response.Body) {
    console.error(
      `Failed to download file. Response: ${JSON.stringify(response, null, 2)}`
    );
    throw new Error(`Failed to download file from S3: ${bucket}/${key}`);
  } else {
    console.log(`Successfully downloaded file from S3: ${bucket}/${key}`);
    return streamToBuffer(response.Body as Readable);
  }
};

// Convert a stream to a buffer
const streamToBuffer = (stream: Readable): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
};

// Generate a key for an image (original or processed)
const generateKey = (
  filename: string,
  type: "original" | "processed" | "package"
): string => {
  const currentDateTime = new Date().toISOString().replace(/:/g, "-");
  const [currentDate, currentTime] = currentDateTime.split("T");
  const formattedDateTime = `${currentDate}_${currentTime.split(".")[0]}_${
    currentTime.split(".")[1]
  }`;
  const prefix = type;
  const key = `${formattedDateTime}_${prefix}_${filename}`;
  console.log(`Generated key: ${key}`);
  return key;
};

// Generate a response with the given status code and body
const generateResponse = (
  statusCode: number,
  body: string
): APIGatewayProxyResult => {
  return {
    statusCode,
    body,
    headers: {
      "Content-Type": "text/html",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,PATCH,OPTIONS",
    },
  };
};
