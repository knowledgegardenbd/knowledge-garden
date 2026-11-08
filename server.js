
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const AdminSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true }
});

const Admin = mongoose.model("Admin", AdminSchema);

app.get("/", (req, res) => {
    res.json({ message: "Knowledge Garden Backend is running!" });
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        database: mongoose.connection.readyState === 1
            ? "Connected"
            : "Not connected"
    });
});

// Admin login
app.post("/api/admin/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const admin = await Admin.findOne({
            email: email.toLowerCase()
        });

        if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            { adminId: admin._id },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.json({
            message: "Login successful",
            token
        });
    } catch (error) {
        res.status(500).json({ message: "Login failed" });
    }
});

// Verify admin token
app.get("/api/admin/me", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const admin = await Admin.findById(decoded.adminId).select("-passwordHash");

        if (!admin) {
            return res.status(401).json({ message: "Admin not found" });
        }

        res.json({ admin });
    } catch (error) {
        res.status(401).json({ message: "Invalid or expired token" });
    }
});

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("MONGODB_URI is missing");
        }

        if (!process.env.ADMIN_EMAIL ||
            !process.env.ADMIN_PASSWORD ||
            !process.env.JWT_SECRET) {
            throw new Error("Admin environment variables are missing");
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log("MongoDB connected successfully");

        const email = process.env.ADMIN_EMAIL.toLowerCase();
        const existingAdmin = await Admin.findOne({ email });

        if (!existingAdmin) {
            const passwordHash = await bcrypt.hash(
                process.env.ADMIN_PASSWORD,
                12
            );

            await Admin.create({ email, passwordHash });
            console.log("Admin account created successfully");
        }

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
}

// Admission Application Model
const AdmissionSchema = new mongoose.Schema({
    studentName: { type: String, required: true },
    fatherName: { type: String, required: true },
    motherName: { type: String, required: true },
    phone: { type: String, required: true },
    className: { type: String, required: true },
    address: { type: String, required: true },
    status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Pending"
    }
}, { timestamps: true });

const Admission = mongoose.model("Admission", AdmissionSchema);

// Submit Admission Application
app.post("/api/admissions", async (req, res) => {
    try {
        const {
            studentName,
            fatherName,
            motherName,
            phone,
            className,
            address
        } = req.body;

        if (!studentName || !fatherName || !motherName ||
            !phone || !className || !address) {
            return res.status(400).json({
                message: "সব তথ্য পূরণ করুন"
            });
        }

        const application = await Admission.create({
            studentName,
            fatherName,
            motherName,
            phone,
            className,
            address
        });

        res.status(201).json({
            message: "ভর্তি আবেদন সফলভাবে জমা হয়েছে",
            applicationId: application._id
        });

    } catch (error) {
        res.status(500).json({
            message: "আবেদন জমা হয়নি"
        });
    }
});

// Get all admission applications (Admin only)
app.get("/api/admissions", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const admin = await Admin.findById(decoded.adminId);

        if (!admin) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const applications = await Admission.find().sort({
            createdAt: -1
        });

        res.json({ applications });

    } catch (error) {
        res.status(401).json({
            message: "Unauthorized or invalid token"
        });
    }
});
                             
startServer();
    
