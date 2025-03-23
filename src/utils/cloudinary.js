import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import dotenv from "dotenv";

dotenv.config();
// Configure Cloudinary
cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null;

        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        });

        console.log("File uploaded successfully to Cloudinary. File URL: " + response.url);

        // Delete the local file after upload
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }

        return response; // Return the Cloudinary file URL
    } catch (error) {
        console.error("Cloudinary upload error:", error);

        // Ensure file is deleted even in case of an error
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }

        return null;
    }
};

const deleteFromCloudinary = async (publicId)=>{
    try{
        const result = await cloudinary.uploader.destroy(publicId);
        console.log("deleted from cloudinary", result);
    }
    catch(error){
        console.log("error deleting from cloudinary" , error);
        return null;
    }
}

export {uploadOnCloudinary , deleteFromCloudinary};
