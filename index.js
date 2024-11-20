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


/*const db = new pg.Client({
    user: process.env.user,
    host: process.env.host,
    database: process.env.database,
    password: process.env.password,
    port: process.env.port
});
*/





const db = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});
db.connect()
.then(() => console.log("Connected to the database"))
.catch(err => console.error("Connection error", err.stack));


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
const userSocketMap={};
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
        
    
    socket.on('register-user', (user_id) => {
        userSocketMap[user_id] = socket.id;
        //console.log(`User ${user_id} is connected with socket ID: ${socket.id}`);
    });

    socket.on('user-message', async ({ message, recipient_id, sender_id }) => {
        const recipientSocketId = userSocketMap[recipient_id];
        const senderSocketId = userSocketMap[sender_id];
        
        await db.query("insert into messages (sender_id, receiver_id, message) values ($1, $2, $3)",[sender_id, recipient_id, message]);
        
        io.to(senderSocketId).emit("message", {message, sender_id});
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("message", {message, sender_id});
            console.log(`Message sent to user ${recipient_id}:`, message);
        } else {
            console.log(`User with ID ${recipient_id} is not connected.`);
        }
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
        req.session.user_name=result[0].user_name;
        //console.log(req.session.user_id);
        var name=result[0].user_name
        res.redirect(`/home`);
        //res.render("home.ejs",{user_id : req.session.user_id, user_name: result[0].user_name});
    }
    else{
        res.send("email or password is incorrect");
    }
});

app.get("/home",requireLogin, (req, res) =>{
    var user_name = req.session.user_name;
    var user_id = req.session.user_id;
    res.render("home.ejs",{user_id : user_id, user_name : user_name});
})


app.get("/traffic",requireLogin, (req,res) =>{
    res.render("traffic.ejs",{ 
        route: null,
        coords1: null,
        coords2: null,
        date: null,
        time: null,
        mapboxToken: process.env.MAPBOX_ACCESS_TOKEN,
        error: null
    });
})

app.post("/traffic",requireLogin, async (req, res) =>{
    const { location_first, location_second, date, time } = req.body;

    console.log("Location 1:", location_first);
    console.log("Location 2:", location_second);
    console.log("Date:", date);
    console.log("Time:", time);

    try {
        // Geocode the first location
        const geocode1Response = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(location_first)}.json`, {
            params: {
                access_token: process.env.MAPBOX_ACCESS_TOKEN,
                limit: 1,
                country: 'IN'
            }
        });

        if (geocode1Response.data.features.length === 0) {
            return res.render('traffic.ejs', { 
                route: null,
                coords1: null,
                coords2: null,
                date,
                time,
                mapboxToken: process.env.MAPBOX_ACCESS_TOKEN,
                error: `Location not found: ${location_first}`
            });
        }

        const coords1 = geocode1Response.data.features[0].center; // [lng, lat]

        // Geocode the second location
        const geocode2Response = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(location_second)}.json`, {
            params: {
                access_token: process.env.MAPBOX_ACCESS_TOKEN,
                limit: 1,
                country: 'IN'
            }
        });

        if (geocode2Response.data.features.length === 0) {
            return res.render('traffic.ejs', { 
                route: null,
                coords1: null,
                coords2: null,
                date,
                time,
                mapboxToken: process.env.MAPBOX_ACCESS_TOKEN,
                error: `Location not found: ${location_second}`
            });
        }

        const coords2 = geocode2Response.data.features[0].center; // [lng, lat]
        
        console.log(coords1);
        console.log(coords2);
        // Fetch directions between the two coordinates

        let directionsResponse;
        try{ 
        directionsResponse = await axios.get(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords1[0]},${coords1[1]};${coords2[0]},${coords2[1]}`, {
            params: {
                access_token: process.env.MAPBOX_ACCESS_TOKEN,
                geometries: 'geojson',
                steps: true,
                overview: 'full',
                annotations: 'congestion' // To include traffic congestion data
            }
        });
        //console.log(`direction response: ${directionsResponse}`);
        }
        catch (err) {
            console.warn("Failed to fetch directions with congestion annotations. Attempting without congestion data.");
            // Retry without congestion annotations
            directionsResponse = await axios.get(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords1[0]},${coords1[1]};${coords2[0]},${coords2[1]}`, {
                params: {
                    access_token: process.env.MAPBOX_ACCESS_TOKEN,
                    geometries: 'geojson',
                    steps: true,
                    overview: 'full'
                    // No annotations
                }
            });
        }
        



        if (!directionsResponse.data.routes && directionsResponse.data.routes.length === 0) {
            return res.render('traffic.ejs', { 
                route: null,
                coords1: null,
                coords2: null,
                date,
                time,
                mapboxToken: process.env.MAPBOX_ACCESS_TOKEN,
                error: 'No route found between the specified locations.'
            });
        }

        const route = directionsResponse.data.routes[0].geometry; // GeoJSON LineString
        console.log(route);

        res.render('traffic.ejs', { 
            route,
            coords1,
            coords2,
            date,
            time,
            mapboxToken: process.env.MAPBOX_ACCESS_TOKEN,
            error: null
        });

    } catch (error) {
        console.error(error);
        res.render('traffic.ejs', { 
            route: null,
            coords1: null,
            coords2: null,
            date,
            time,
            mapboxToken: process.env.MAPBOX_ACCESS_TOKEN,
            error: 'An error occurred while processing your request.'
        });
    }

})


app.get("/message", requireLogin, async (req, res) =>{
    var x = await db.query("select * from users where id!=$1",[req.session.user_id]);
    var result=x.rows;
    //console.log(result);
    res.render("message_users.ejs",{data : result});
});

app.get("/message/:id", requireLogin, async (req, res) =>{
    var sender = req.session.user_id;
    var receiver = req.params.id;
    console.log(sender);
    console.log(receiver);
    var y = await db.query("select * from messages where (sender_id=$1 and receiver_id=$2) or (sender_id=$2 and receiver_id=$1) order by timestamp",[sender, receiver]);
    //console.log(y.rows);
    res.render("chat.ejs", {sender: sender, receiver: receiver, chat_history : y.rows});
});



app.get("/log_out", (req,res)=>{
    req.session.user_id=0;
    req.session.user_name=null;
    res.redirect("/");
});


server.listen(port,()=>{
    console.log(`http://localhost:${port}`);
})