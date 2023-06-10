import { awscdk } from "projen";
const project = new awscdk.AwsCdkTypeScriptApp({
  name: "p6-ldar-cdk-projen-brand-image",

  authorEmail: "pgollucci@p6m7g8.com",
  authorName: "Philip M. Gollucci",
  authorUrl: "https://www.linkedin.com/in/pgollucci",
  authorOrganization: true,

  repository: "https://github.com/p6m7g8/p6-ldar-cdk-projen-brand-image.git",
  stability: "experimental",

  description: "APIGW Receiver Serverless Image Brander for LDAR Pets",
  keywords: ["aws", "cdk", "pets", "dog", "cat", "ldar", "branding"],

  cdkVersion: "2.81.0",
  defaultReleaseBranch: "main",
  projenrcTs: true,
  releaseFailureIssue: true,
  prettier: true,
  autoApproveUpgrades: true,
  autoApproveOptions: {
    allowedUsernames: ["p6m7g8-automation"],
  },

  devDeps: ["@types/adm-zip", "@types/mime-types"],

  deps: [
    "@aws-cdk/aws-apigatewayv2-alpha@2.83.1-alpha.0",
    "@aws-cdk/aws-apigatewayv2-integrations-alpha@2.83.1-alpha.0",
    "@aws-sdk/client-s3",
    "@aws-sdk/client-ses",
    "@aws-sdk/s3-request-presigner",
    "@types/aws-lambda",
    "adm-zip",
    "cdk-iam-floyd",
    "mime-types",
    "sharp",
  ],
});
project.synth();
