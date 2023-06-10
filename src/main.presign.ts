import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  const bucketName = process.env.BUCKET_NAME ?? "p6-dne";

  const client = new S3Client({ region: "us-east-1" });

  const body = JSON.parse(event.body || "{]");
  const filename = body.filename;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: filename,
  });

  const url = await getSignedUrl(client, command, { expiresIn: 3600 });
  console.log(url);

  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,PATCH,OPTIONS",
    },
    body: JSON.stringify({ url: url }),
  };
};
