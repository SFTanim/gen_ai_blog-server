require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(
    cors({
        origin: ["http://localhost:5173"],
        credentials: true,
    })
);

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
        console.log("Generated Text:", generatedText);

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
        console.error("Error with Google Generative AI:", error.message || error);
        res.status(500).json({ error: "Error generating text from the AI model." });
    }
});




// Ping MongoDB
async function run() {
    try {
        // await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
        const blogCollection = client.db("GenAiBlog").collection("blogs")

        app.get("/blogs", async (req, res) => {
            const result = await blogCollection.find().toArray()
            res.send(result)
        })

        app.post("/blogs", async (req, res) => {
            const data = req.body;
            console.log(data);
            const result = await blogCollection.insertOne(data)
            res.send(result)
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
