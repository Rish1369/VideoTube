import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const connectDB = async () => {
    try {
        const mongoURI = `${process.env.MONGODB_URI}/${DB_NAME}?retryWrites=true&w=majority`;

        const connectionInstance = await mongoose.connect(mongoURI);

        console.log(`MongoDB connected to database: ${connectionInstance.connection.name}`);
    } catch (error) {
        console.error("MongoDB connection error:", error);
        process.exit(1);
    }
};

export default connectDB;
