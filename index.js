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






/*const db = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});
db.connect()
.then(() => console.log("Connected to the database"))
.catch(err => console.error("Connection error", err.stack));
*/

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


const users={};
io.on('connection', (socket) =>{
    console.log(`A user connected with socket id: ${socket.id}`);
    

    socket.on('deviceLocation', ({ latitude, longitude, user_id, user_name}) =>{
        /*console.log(`Latiutde: ${latitude}`);
        console.log(`longitude: ${longitude}`);
        console.log(`username: ${user_name}`);*/
        users[user_id]={latitude, longitude, user_name};
        //console.log(users);
        socket.emit('location', {latitude, longitude, user_id, user_name});
    });
        
    
    setInterval(()=>{
    socket.emit('online_users', users)
    },1000);
    
 
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
        req.session.user_id = result[0].id;
        //console.log(req.session.user_id);
        var name=result[0].user_name
        res.redirect(`/home/${name}`);
        //res.render("home.ejs",{user_id : req.session.user_id, user_name: result[0].user_name});
    }
    else{
        res.send("email or password is incorrect");
    }
});

app.get("/home/:id",requireLogin, (req, res) =>{
    var user_name = req.params.id;
    var user_id = req.session.user_id;
    res.render("home.ejs",{user_id : user_id, user_name : user_name});
})


server.listen(port,()=>{
    console.log(`http://localhost:${port}`);
})