
exports.handler = async (event, context) => {
  var response;
  var accountArn = JSON.stringify(context.invokedFunctionArn);
  var accountId = JSON.parse(accountArn).split(':')[4];
  var acntId = accountId.slice(accountId.length - 4);
  //API Gateway - left for testing lambda
  response = {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify('Hello from - API Gateway: ***' + acntId),
  };
  // Function is invoked by ALB
  if (event.requestContext && event.requestContext.elb) {
    response.statusDescription = '200 OK';
    response.isBase64Encoded = false;
    response.body = 'Hello from: ***' + acntId;
  }
  return response;
};
