import * as apigw from "@aws-cdk/aws-apigatewayv2-alpha";
import * as apigwi from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import * as cdk from "aws-cdk-lib";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdajs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ses from "aws-cdk-lib/aws-ses";
import * as floyd from "cdk-iam-floyd";
import { Construct } from "constructs";

const HOSTED_ZONE_NAME = "p6m7g8.net";
const VERIFY_EMAIL = `pgollucci@${HOSTED_ZONE_NAME}`;
const SUBDOMAIN_NAME = "ldar";
const FROM_EMAIL = "ldar-pet-brander@p6m7g8.com";
const RECORD_NAME = SUBDOMAIN_NAME + "." + HOSTED_ZONE_NAME;

export class MyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps = {}) {
    super(scope, id, props);

    // const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
    //   domainName: HOSTED_ZONE_NAME,
    // });

    const certificate = new certificatemanager.Certificate(
      this,
      "Certificate",
      {
        domainName: RECORD_NAME,
        validation: certificatemanager.CertificateValidation.fromEmail({
          email: VERIFY_EMAIL,
        }),
      }
    );

    const domainName = new apigw.DomainName(this, "DN", {
      domainName: RECORD_NAME,
      certificate: certificate,
    });

    const senderEmail = ses.Identity.email(FROM_EMAIL);
    new ses.EmailIdentity(this, "Identity", {
      identity: senderEmail,
    });

    const bucket = new s3.Bucket(this, "MyBucket", {
      accessControl: s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
      publicReadAccess: true,
      websiteIndexDocument: "index.html",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],
    });

    const presignFunc = new lambdajs.NodejsFunction(this, "presign", {
      runtime: lambda.Runtime.NODEJS_18_X,
    });
    bucket.grantPut(presignFunc);
    bucket.grantPublicAccess("*", "s3:PutObject");

    presignFunc.addEnvironment("BUCKET_NAME", bucket.bucketName);

    const brandFunc = new lambdajs.NodejsFunction(this, "brand", {
      runtime: lambda.Runtime.NODEJS_18_X,
      tracing: lambda.Tracing.ACTIVE,
      timeout: cdk.Duration.minutes(14),
      memorySize: 512,
      bundling: {
        nodeModules: ["sharp"],
        forceDockerBundling: true,
        //        minify: true,
      },
    });
    bucket.grantReadWrite(brandFunc);

    brandFunc.addEnvironment("BRAND_IMAGE_BUCKET", bucket.bucketName);
    brandFunc.addEnvironment("EMAIL_SENDER", FROM_EMAIL);
    brandFunc.addEnvironment("EMAIL_REGION", "us-east-1");
    brandFunc.addEnvironment("FIT", "fill");

    const policy = new floyd.Iam().allow().to("ses:SendEmail").on("*");
    brandFunc.addToRolePolicy(policy);

    const httpApi = new apigw.HttpApi(this, "HttpApi", {
      description: "Pet Brander API",
      corsPreflight: {
        allowHeaders: ["*"],
        allowMethods: [apigw.CorsHttpMethod.ANY],
        allowOrigins: ["*"],
        maxAge: cdk.Duration.days(10),
      },
      defaultDomainMapping: {
        domainName: domainName,
      },
    });

    const presignIntegration = new apigwi.HttpLambdaIntegration(
      "FuncIntegration",
      presignFunc
    );
    httpApi.addRoutes({
      path: "/presign",
      methods: [apigw.HttpMethod.POST],
      integration: presignIntegration,
    });

    const brandIntegration = new apigwi.HttpLambdaIntegration(
      "brandIntegration",
      brandFunc
    );
    httpApi.addRoutes({
      path: "/brand",
      methods: [apigw.HttpMethod.POST],
      integration: brandIntegration,
    });
  }
}

const theEnv = {
  account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();
new MyStack(app, "p6-ldar-cdk-projen-brand-image", { env: theEnv });
app.synth();
