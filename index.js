const express = require('express');
const app = express()
const jwt = require("jsonwebtoken");
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { GoogleGenerativeAI } = require("@google/generative-ai");

app.use(
    cors({
        origin: ["https://tranquil-crepe-88ce75.netlify.app"],
        credentials: true,
    })
);
        app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.9sxzsr9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// MongoDB client setup
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Google Generative AI Configuration
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash", // Specify the model name
});

const generationConfig = {
    temperature: 1,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
    responseMimeType: "text/plain",
};

// Data collect from GEMINI
app.post('/api/suggest', async (req, res) => {
    try {
        const userInput = req.body.input;
        if (!userInput) {
            return res.status(400).json({ error: "Input is required." });
        }

        const newData = `Generate a blog title, subtitle, and description with more explanation based on this paragraph:
                "${userInput}"
                Output format:
                Title: [title]
                Subtitle: [subtitle]
                Description: [description]`;

        // Start a chat session and send the input to the AI model
        const chatSession = model.startChat({
            generationConfig,
            history: [],
        });

        const result = await chatSession.sendMessage(newData);

        // Ensure the response is properly retrieved
        if (!result || !result.response) {
            return res.status(500).json({ error: "Failed to retrieve a valid response from the AI model." });
        }

        const generatedText = result.response.text();

        if (!generatedText) {
            return res.status(500).json({ error: "Failed to generate text." });
        }

        // Extract Title, Subtitle, and Description
        const titleMatch = generatedText.match(/Title:\s*(.*)/);
        const subtitleMatch = generatedText.match(/Subtitle:\s*(.*)/);
        const descriptionMatch = generatedText.match(/Description:\s*(.*)/);

        // Remove asterisks (if any) from the extracted strings
        const cleanText = (text) => text.replace(/\*\*/g, '').trim();

        const title = titleMatch ? cleanText(titleMatch[1]) : null;
        const subtitle = subtitleMatch ? cleanText(subtitleMatch[1]) : null;
        const description = descriptionMatch ? cleanText(descriptionMatch[1]) : null;

        if (!title || !subtitle || !description) {
            return res.status(500).json({ error: "Failed to parse title, subtitle, or description from the generated text." });
        }

        // Send the extracted title, subtitle, and description
        res.json({ title, subtitle, description });
    } catch (error) {
        res.status(500).json({ error: "Error generating text from the AI model." });
    }
});




// Ping MongoDB
async function run() {
    try {
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        const blogCollection = client.db("GenAiBlog").collection("blogs")
        const usersCollections = client.db("GenAiBlog").collection("users")

        // Verifying Token
        const verifyingToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: "unauthorizes access" })
            }
            const token = req.headers.authorization.split(" ")[1]
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: "Unauthorized Access!" });
                }
                res.decoded = decoded;
                next()
            })
        }



        // Sending JWT
        app.post("/jwt", async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET);
            res.send({ token });
        });



        // Users
        app.get("/users", async (req, res) => {
            const result = await usersCollections.find().toArray();
            res.send(result);
        });

        app.post("/users", async (req, res) => {
            const userInfo = req.body;
            const query = { email: userInfo.email };
            const existingUser = await usersCollections.findOne(query);

            if (existingUser) {
                return res.send({
                    message: "User Email Already Exists",
                    insertedId: null,
                });
            }
            const result = await usersCollections.insertOne(userInfo);
            res.send(result);
        });


        // Blog
        app.get("/blogs", async (req, res) => {
            const result = await blogCollection.find().toArray()
            res.send(result)
        })

        app.post("/blogs", async (req, res) => {
            const data = req.body;
            const result = await blogCollection.insertOne(data)
            res.send(result)
        })

        app.get("/blog/:id", verifyingToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await blogCollection.findOne(query)
            res.send(result)
        })


        // Blog Like
        app.post("/blogLike/:email/:id", async (req, res) => {
            const userEmail = req.params.email;
            const blogId = req.params.id
            const blogFilter = { _id: new ObjectId(blogId) }
            const blog = await blogCollection.findOne(blogFilter)
            const options = { upsert: true }

            if (blog.dislike.includes(userEmail) && !blog.like.includes(userEmail)) {
                updateDoc = {
                    $push: { like: userEmail },
                    $pull: { dislike: userEmail }
                };
            }
            else if (blog.dislike.includes(userEmail) && blog.like.includes(userEmail)) {
                updateDoc = {
                    $pull: { dislike: userEmail, like: userEmail }
                };
            }
            else if (!blog.dislike.includes(userEmail) && !blog.like.includes(userEmail)) {
                updateDoc = {
                    $push: { like: userEmail },
                };
            }
            else if (blog.like.includes(userEmail)) {
                updateDoc = {
                    $pull: { like: userEmail },
                };
            }

            const resultNew = await blogCollection.updateOne(blogFilter, updateDoc, options)
            res.send(resultNew);
        })

        // Blog Dislike
        app.post("/blogDislike/:email/:id", async (req, res) => {
            const userEmail = req.params.email;
            const blogId = req.params.id
            const blogFilter = { _id: new ObjectId(blogId) }
            const blog = await blogCollection.findOne(blogFilter)
            const options = { upsert: true }

            if (blog.dislike.includes(userEmail) && !blog.like.includes(userEmail)) {
                updateDoc = {
                    $pull: { dislike: userEmail }
                };
            }
            else if (blog.dislike.includes(userEmail) && blog.like.includes(userEmail)) {
                updateDoc = {
                    $pull: { dislike: userEmail, like: userEmail }
                };
            }
            else if (!blog.dislike.includes(userEmail) && !blog.like.includes(userEmail)) {
                updateDoc = {
                    $push: { dislike: userEmail },
                };
            }
            else if (!blog.dislike.includes(userEmail) && blog.like.includes(userEmail)) {
                updateDoc = {
                    $pull: { like: userEmail },
                    $push: { dislike: userEmail },
                };
            }

            const resultNew = await blogCollection.updateOne(blogFilter, updateDoc, options)
            res.send(resultNew);
        })


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

// Default route

app.get("/", (req, res) => {
    res.send("GenAiBlog Server Is Running....");
});

// Start server
app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});
