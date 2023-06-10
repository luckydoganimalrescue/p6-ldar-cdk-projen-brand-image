import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { MyStack } from "../src/main";

test("Snapshot", () => {
  const theEnv = {
    account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION,
  };
  const app = new App();
  const stack = new MyStack(app, "test", { env: theEnv });

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});
