const { application } = require("express");
const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUI = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: { title: "Line-up web app", version: "1.0.0" },
  },
  apis: ["api/routes/index.js", "api/db/index.js"],
};

const swaggerSpec = swaggerJSDoc(options);

const swaggerDocs = (app, num) => {
  app.use("/api/docs", swaggerUI.serve, swaggerUI.setup(swaggerSpec));
  app.get("/api/docs.json", (req, res) => {
    res.setHeader("Content-type", "application/json");
    res.send(swaggerSpec);
  });

  console.log(`TEST FUNCIONA http://locahost:${num}/api/docs`);
};

module.exports = { swaggerDocs };
