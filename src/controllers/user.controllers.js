import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import { deleteFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
const generateAccessAndRefreshToken = async (userId) =>{
    try {
        const user = User.findById(userId);
        if(!user){
            throw new ApiError(400 , "user does not exist");
        }
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();
    
        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false});
        return {accessToken , refreshToken};
    } catch (error) {
        throw new ApiError(500 , "something went wrong while generating the accesstoken and refreshtoken")
    }
}
const registerUser = asyncHandler(async(req , res)=>{
    const {fullname, email, username, password}= req.body
    //validation
    if([fullname , email , username , password].some((field)=> field?.trim() === "")){
        throw new ApiError(400 , "All fields are required");
    }
    const existedUser = await User.findOne({$or:[{username} , {email}]});
    if(existedUser){
        throw new ApiError(409 , "user already exist");
    }
    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverLocalPath = req.files?.coverImage[0]?.path;

    if(!avatarLocalPath){
        throw new ApiError(400 , "avatar is missing");
    }
    // const avatar = await uploadOnCloudinary(avatarLocalPath);

    let avatar;
    try {
        avatar = await uploadOnCloudinary(avatarLocalPath);
        console.log("avatar uploaded" , avatar);
    } catch (error) {
        console.log("error uploading avatar", error);
        throw new ApiError(500 , "failed to load avatar");
    }

    let coverImage = "";
    if(coverLocalPath){
        try {
            coverImage = await uploadOnCloudinary(coverLocalPath);
            console.log("coverImage uploaded" , coverImage);
        } catch (error) {
            console.log("error uploading coverImage", error);
            throw new ApiError(500 , "failed to load coverImage");
        }
    }
    
    try {
        const user = await User.create({
                        fullname,
                        avatar:avatar.url,
                        coverImage:coverImage.url||"",
                        email,
                        password,
                        username: username.toLowerCase()
                    })
        const createdUser = await User.findById(user._id).select(
            "-password -refreshToken"
        )
        if(!createdUser){
            throw new ApiError(500 , "something went wrong while registering");
        }
        
        return res
        .status(201)
        .json(new ApiResponse(200 , createdUser , "user registerd successfully"))
    } catch (error) {
        console.log("user creation failed");
        if(avatar){
            await deleteFromCloudinary(avatar.public_id);
        }
        if(coverImage){
            await deleteFromCloudinary(coverImage.public_id);
        }
        throw new ApiError(500 , "something went wrong while registering and images were deleted");
    }
})
const loginUser = asyncHandler( async(req , res)=> {
    const {email , username , password} = req.body;
    for (const field of [email, username, password]) {
        if (!field) {
            throw new ApiError(400, `${field} is required`);
        }
    }    
    const user = await User.findOne({$or:[{username} , {email}]});
    if(!user){
        throw new ApiError(404 , "user not found");
    }
    // validate password
    const isPasswordValid = await user.isPasswordCorrect(password);
    if(!isPasswordValid){
        throw new ApiError(401 , "Invalid credentials");
    }

    const {accessToken , refreshToken} = await generateAccessAndRefreshToken(user._id);
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
    if(!loggedInUser){
        throw new ApiError(400 , "Something went wrong while logging");
    }
    const options = {
        httpOnly : true,
        secure: process.env.NODE_ENV === "production",
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken , options)
    .cookie("refreshToken" , refreshToken , options)
    .json(new ApiResponse(200,{user : loggedInUser , accessToken , refreshToken},"user logged in successfully"))
})
const refreshAccessToken = asyncHandler(async(req , res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if(!incomingRefreshToken){
        throw new ApiError(401 , "refresh token is required");
    }
    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
        const user = await User.findById(decodedToken?._id);
        if(!user){
            throw new ApiError(401 , "Invalid refresh token");
        }
        if(user?.refreshToken !== incomingRefreshToken){
            throw new ApiError(401 , "Invalid refresh token");
        }
        const options = {
            httpOnly : true,
            secure: process.env.NODE_ENV === "production"
        }

        const {accessToken , refreshToken: newRefreshToken} =  await generateAccessAndRefreshToken(user._id);
        user.refreshToken = newRefreshToken;
        await user.save({ validateBeforeSave: false });
        return res
        .status(200)
        .cookie("accessToken" , accessToken , options)
        .cookie("refreshToken" ,newRefreshToken , options)
        .json(new ApiResponse(
            200,
            { accessToken , refreshToken: newRefreshToken },
            "AccessToken refreshed successfully"
        ));
    } catch (error) {
        throw new ApiError(500, "Something went wrong while refreshing token", error);
    }
})
const logOutUser = asyncHandler(async(req , res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshToken : undefined,
            }
        },
        {new : true}
    )
    const options ={
        httpOnly:true,
          secure: process.env.NODE_ENV === "production"
    }
    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken" , options)
    .json(new ApiResponse(200 , {} , "user logged out successfully"))
})  
const changeCurrentPassword = asyncHandler(async (req , res)=>{
    const {oldPassword , newPassword} = req.body;
    const user = await User.findById(req.user?._id);
    const isPasswordValid = await user.isPasswordCorrect(oldPassword);
    if(!isPasswordValid){
        throw new ApiError(401 , "Old password is incorrect");
    }
    user.password = newPassword;
    await user.save({validateBeforeSave:false});
    return res.send.status(200).json(new ApiResponse(200 , {} , "password changed successfully."))
});
const getCurrentUser = asyncHandler(async (req , res)=>{
    return res.status(200).json(new ApiResponse(200 , req.user , "Current user details"));
});
const updateAccountDetails = asyncHandler(async (req , res)=>{
    const {fullname , email} = req.body;
    if(!fullname || !email){
        throw new ApiError(400 , "Fullname and email is required")
    }
    const user = User.findByIdAndUpdate(req.user?._id ,{
       $set: {
        fullname,
        email: email
        }
    } ,{new : true}).select("-password -refreshToken");

    return res.status(200).json(new ApiResponse(200 , user , "Account detail updated successfully"));
});
const updateUserAvatar = asyncHandler(async (req , res)=>{
    const avatarLocalPath = req.file?.path;
    if(!avatarLocalPath){
        throw new ApiError(400 , "file is required");
    }
    const avatar  = await uploadOnCloudinary(avatarLocalPath);
    if(!avatar.url){
        throw new ApiError(500,"something went wrong");
    }
    const user  = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                avatar:avatar.url
            }
        },
        {new:true}
        ).select("-password -refreshToken")

        return res.status(200).json(new ApiResponse(200 , user , "Avatar updated successfully"));
});
const updateUserCovererImage = asyncHandler(async (req , res)=>{
    const coverImageLocalPath = req.file?.path;
    if(!coverImageLocalPath){
        throw new ApiError(400 , "file is required");
    }
    const coverImage  = await uploadOnCloudinary(coverImageLocalPath);
    if(!coverImage.url){
        throw new ApiError(500,"something went wrong while uploading coverImage");
    }
    const user  = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                coverImage:coverImage.url
            }
        },
        {new:true}
        ).select("-password -refreshToken")

        return res.status(200).json(new ApiResponse(200 , user , "coverImage updated successfully"));
});
export {
    registerUser,
    loginUser,
    refreshAccessToken,
    logOutUser,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCovererImage
};