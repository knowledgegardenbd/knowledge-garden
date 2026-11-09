
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const AdminSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true }
});

const Admin = mongoose.model("Admin", AdminSchema);

// Generate unique application ID
function generateApplicationId() {
    const year = new Date().getFullYear();
    const random = crypto.randomBytes(5).toString("hex").toUpperCase();

    return `KG-${year}-${random}`;
}

// Admission Application Model
const AdmissionSchema = new mongoose.Schema({
    applicationId: {
        type: String,
        unique: true,
        sparse: true,
        default: generateApplicationId
    },

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

// Home
app.get("/", (req, res) => {
    res.json({
        message: "Knowledge Garden Backend is running!"
    });
});

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        database: mongoose.connection.readyState === 1
            ? "Connected"
            : "Not connected"
    });
});

// Verify admin token helper
async function verifyAdmin(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "অনুমতি নেই। আবার লগইন করুন।"
            });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const admin = await Admin.findById(decoded.adminId);

        if (!admin) {
            return res.status(401).json({
                message: "অ্যাডমিন পাওয়া যায়নি।"
            });
        }

        req.admin = admin;
        next();

    } catch (error) {
        return res.status(401).json({
            message: "অনুমোদন ব্যর্থ হয়েছে।"
        });
    }
}

// Admin Login
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
        res.status(500).json({
            message: "Login failed"
        });
    }
});

// Verify Admin
app.get("/api/admin/me", verifyAdmin, (req, res) => {
    res.json({
        admin: {
            email: req.admin.email
        }
    });
});

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
            studentName: studentName.trim(),
            fatherName: fatherName.trim(),
            motherName: motherName.trim(),
            phone: phone.trim(),
            className: className.trim(),
            address: address.trim()
        });

        res.status(201).json({
            message: "ভর্তি আবেদন সফলভাবে জমা হয়েছে",
            applicationId: application.applicationId,
            applicationDate: application.createdAt,
            status: application.status
        });

    } catch (error) {
        console.error("Admission submission error:", error);

        res.status(500).json({
            message: "আবেদন জমা হয়নি। আবার চেষ্টা করুন।"
        });
    }
});

// Student: Check application status using Application ID
app.get("/api/admissions/status/:applicationId", async (req, res) => {
    try {
        const applicationId = req.params.applicationId
            .trim()
            .toUpperCase();

        const application = await Admission.findOne({
            applicationId
        }).select("applicationId studentName className status createdAt");

        if (!application) {
            return res.status(404).json({
                message: "এই Application ID-তে কোনো আবেদন পাওয়া যায়নি।"
            });
        }

        res.json({
            message: "আবেদনের তথ্য পাওয়া গেছে",
            application: {
                applicationId: application.applicationId,
                studentName: application.studentName,
                className: application.className,
                status: application.status,
                applicationDate: application.createdAt
            }
        });

    } catch (error) {
        res.status(500).json({
            message: "তথ্য দেখা যাচ্ছে না। আবার চেষ্টা করুন।"
        });
    }
});

// Admin: Search and filter applications
app.get("/api/admissions", verifyAdmin, async (req, res) => {
    try {
        const { search, status } = req.query;

        const filter = {};

        if (status && ["Pending", "Approved", "Rejected"].includes(status)) {
            filter.status = status;
        }

        if (status && !["Pending", "Approved", "Rejected"].includes(status)) {
            return res.status(400).json({
                message: "ভুল Status নির্বাচন করা হয়েছে।"
            });
        }

        if (search && search.trim()) {
            const searchText = search.trim();

            filter.$or = [
                { applicationId: searchText.toUpperCase() },
                {
                    studentName: {
                        $regex: searchText,
                        $options: "i"
                    }
                }
            ];
        }

        const applications = await Admission.find(filter).sort({
            createdAt: -1
        });

        res.json({
            total: applications.length,
            applications
        });

    } catch (error) {
        res.status(500).json({
            message: "আবেদন লোড করা যায়নি।"
        });
    }
});

// Admin: Approve or Reject application
app.patch("/api/admissions/:id/status", verifyAdmin, async (req, res) => {
    try {
        const { status } = req.body;

        if (!["Approved", "Rejected"].includes(status)) {
            return res.status(400).json({
                message: "সঠিক Status নির্বাচন করুন।"
            });
        }

        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                message: "ভুল আবেদন ID।"
            });
        }

        const application = await Admission.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true, runValidators: true }
        );

        if (!application) {
            return res.status(404).json({
                message: "আবেদন পাওয়া যায়নি।"
            });
        }

        res.json({
            message: "আবেদনের Status সফলভাবে পরিবর্তন হয়েছে।",
            application
        });

    } catch (error) {
        res.status(500).json({
            message: "Status পরিবর্তন করা যায়নি।"
        });
    }
});

// Start server
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

        // Create admin if not already available
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

        // Add Application IDs to old applications
        const oldApplications = await Admission.find({
            $or: [
                { applicationId: { $exists: false } },
                { applicationId: null },
                { applicationId: "" }
            ]
        });

        for (const application of oldApplications) {
            application.applicationId = generateApplicationId();
            await application.save();
        }

        console.log("Old admission applications updated");

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on port ${PORT}`);
        });

    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
}

startServer();
    
