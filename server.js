'use strict';
var http = require("http");
var fs = require("fs");

var page = fs.readFileSync("main.html");
var shader = fs.readFileSync("shader.txt");
var image = fs.readFileSync("missing.jpg");
var port = process.env.PORT || 1337;

http.createServer(function (req, res) {
  if (req.method === "GET") {
    //main html page
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(page);
    }

    //shader wsgl file
    if (req.url === "/shader.txt") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(shader);
    }

    //missing texture file
    if (req.url === "/missing.jpg") {
      res.writeHead(200, { "Content-Type": "image/jpg" });
      res.end(image);
    }

    //any js script file
    if (req.url.endsWith(".js")) {
      var name = req.url.substr(1);
      var script = fs.readFileSync(name);
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(script);
    }
  }
}).listen(port);