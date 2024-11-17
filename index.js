import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import session from "express-session";
import { fileURLToPath } from 'url'; 
import http from "http";
import { Server } from "socket.io";




const app = express();
const port = 9000;
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended: true}));


app.get("/", (req, res) =>{
    res.render("home.ejs");
})




server.listen(port,()=>{
    console.log(`http://localhost:${port}`);
})