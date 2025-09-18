import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import dotenv from "dotenv";
import { log } from "console";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload file from local path
export const uploadToCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;

    // Upload image to cloudinary
    const result = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    // After uploading to cloudinary remove file from local uploads folder
    console.log("File is uploaded in cloudinary", result.url);
    return result;
  } catch (error) {
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath); // remove file from local uploads folder
    }
    console.log("Error while uploading to cloudinary", error.message);
    throw new Error("Cloudinary upload failed");
  }
};

// Upload buffer directly (for multer memory storage)
export const uploadBufferToCloudinary = async (buffer, folder = "") => {
  try {
    if (!buffer) return null;

    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "auto",
            folder: folder,
          },
          (error, result) => {
            if (error) {
              console.log(
                "Error while uploading buffer to cloudinary",
                error.message
              );
              reject(new Error("Cloudinary upload failed"));
            } else {
              console.log("Buffer uploaded to cloudinary", result.secure_url);
              resolve(result);
            }
          }
        )
        .end(buffer);
    });
  } catch (error) {
    console.log("Error while uploading buffer to cloudinary", error.message);
    throw new Error("Cloudinary upload failed");
  }
};

// Delete image from cloudinary
export const deleteFromCloudinary = async (imageUrl) => {
  try {
    if (!imageUrl) return null;

    // Extract public_id from URL
    const urlParts = imageUrl.split("/");
    const filename = urlParts[urlParts.length - 1];
    const publicId = filename.split(".")[0];

    // For images in folders, we need to include the folder path
    const folderIndex = urlParts.indexOf("upload") + 2; // Skip version number
    const folderPath = urlParts.slice(folderIndex, -1).join("/");
    const fullPublicId = folderPath ? `${folderPath}/${publicId}` : publicId;

    const result = await cloudinary.uploader.destroy(fullPublicId);
    console.log("File deleted from cloudinary", result);
    return result;
  } catch (error) {
    console.log("Error while deleting from cloudinary", error.message);
    throw new Error("Cloudinary delete failed");
  }
};
