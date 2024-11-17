import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";
import session from "express-session";
import { fileURLToPath } from 'url'; 
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
dotenv.config();



const app = express();
const port = 9000;
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended: true}));


const db = new pg.Client({
    user: process.env.user,
    host: process.env.host,
    database: process.env.database,
    password: process.env.password,
    port: process.env.port
});

db.connect();


app.use(session({
    secret: 'secret', // Change this to a more secure random string in production
    resave: false,
    saveUninitialized: true
}));

const requireLogin = (req, res, next) => {
    if (req.session.user_id) {
        next(); // User is authenticated, proceed to the next middleware
    } else {
        res.redirect("/"); // Redirect to login page if not authenticated
    }
};



io.on('connection', (socket) =>{
    console.log(`A user connected with socket id: ${socket.id}`);
    

    socket.on('deviceLocation', ({ latitude, longitude }) =>{
        //console.log(`Latiutde: ${latitude}`);
        //console.log(`longitude: ${longitude}`);
        socket.emit('location', {latitude, longitude});
    });

    

});


app.get("/", (req, res) =>{
    res.render("login.ejs");
});


app.get("/sign_up", (req, res)=>{
    res.render("sign_up.ejs");
});

app.post("/sign_up", async (req, res)=>{
    var user_name = req.body.user_name;
    var password = req.body.password;
    var email = req.body.email;
    var response = await db.query("select * from users where email = $1",[email]);
        var result = response.rows;
        if(result.length>0){
            res.send("user already exist");
        }
        else{
            await db.query("insert into users (email, password, user_name) values ($1, $2, $3)",[email, password, user_name]);
            res.render("login.ejs");
        }
})

app.post("/login", async (req,res) =>{
    var email = req.body.email;
    var password=req.body.password;
    
    
    var response = await db.query("select * from users where email=$1 and password=$2",[email, password]);
    var result = response.rows;
    if(result.length>0){
        req.session.user_id = result[0].user_id;
        var users = await db.query("select * from users");
        res.render("home.ejs",{users: users.rows});
    }
    else{
        res.send("email or password is incorrect");
    }
});


server.listen(port,()=>{
    console.log(`http://localhost:${port}`);
})