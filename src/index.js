import dotenv from "dotenv";
import connectDB from "./db/index.js";
import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import {User} from './models/user.model.js'
import {Transaction} from './models/transaction.model.js'
// interface TransactionRecord { //as stored in the server database
//     name: string;
//     amount: number;
//     transactionType: string;
//     isRecurring: boolean;
//     date: string;
//     categoryName: string;
//     categoryColor: string;
// };
// interface TransactionLocalProps {
//     id: number,
//     name: string,
//     category: {
//         id: number,
//         name: string,
//         color: string
//     },
//     amount: number,
//     isDebit: boolean,
//     isRecurring: boolean,
//     date: string
// }

dotenv.config({
    path: './.env'
})

const app = express()
app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}))

app.use(express.json({limit: "20kb"}))
app.use(express.urlencoded({extended: true, limit: "20kb"}))
app.use(express.static("public"))
app.use(cookieParser())

connectDB()
.then(() => {
    app.post('/register', (req, res) => {
        const {email, fullName, password} = req.body;
        User.findOne({email: email.trim().toLowerCase()})
        .then((user) => {
            if (user) res.json({message: "User with same email already exists."});
            else {
                User.create({
                    email: email.trim().toLowerCase(),
                    fullName: fullName.trim(),
                    password: password.trim()
                })
                .then(res.json({message: "Success"}))
                .catch((err) => res.json({message: err}));
            }
        }).catch((err) => res.json({message: err}));
    });

    app.post('/login', async (req, res) => {
        const {email, password} = req.body;
        const user = await User.findOne({email: email.trim().toLowerCase()})
        if (!user) res.json({message: "No record found. Please register first."});
        else {
            const check = await user.isPasswordCorrect(password.trim())
            if (!check) res.json({message: "Wrong password"});
            else {
                const refreshToken = user.generateRefreshToken();
                const accessToken = user.generateAccessToken();
                user.refreshToken = refreshToken;
                await user.save();
                res.cookie("refreshToken", refreshToken, {
                    httpOnly: true,
                    sameSite: "strict",
                    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
                });
                const transaction = new Array(user.transactionRecord.length);
                for (let i = 0; i < user.transactionRecord.length; i++) {
                    transaction[i] = await Transaction.findById(user.transactionRecord[i]);
                }
                if (transaction.length === 0) {
                    return res.json({
                        message: "Login successful",
                        accessToken,
                        refreshToken,
                        user: {
                            _id: user._id,
                            email: user.email,
                            fullName: user.fullName,
                            transactionRecord: []
                        }
                    });
                }
                // If transaction is not empty, map it to the required format
                const mappedTransaction = transaction.map(t => ({
                    name: t.name,
                    amount: t.amount,
                    transactionType: t.transactionType,
                    isRecurring: t.isRecurring,
                    date: t.date,
                    categoryName: t.categoryName,
                    categoryColor: t.categoryColor
                }));
                res.json({
                    message: "Login successful",
                    accessToken,
                    refreshToken,
                    user: {
                        _id: user._id,
                        email: user.email,
                        fullName: user.fullName,
                        transactionRecord: mappedTransaction
                    }
                });
            }
        }
    });

    app.post('/logout', async (req, res) => {
        try {
            const { fullName, email, transactions_string } = req.body;
            
            // Validate required fields
            if (!fullName || !email || !transactions_string) {
            return res.status(400).json({ 
                message: "Missing required fields: fullName, email, or transactions_string" 
            });
            }
            
            const userEmail = email.trim().toLowerCase();
            const userFullName = fullName.trim();
            let parsedTransactions = [];
            
            try {
            parsedTransactions = JSON.parse(transactions_string);
            if (!Array.isArray(parsedTransactions)) {
                return res.status(400).json({ message: "Transactions data must be an array." });
            }
            } catch (error) {
            console.error("Error parsing transactions_string:", error);
            return res.status(400).json({ message: "Invalid transactions data format." });
            }

            // Validate and prepare transaction data
            const validTransactions = [];
            for (let i = 0; i < parsedTransactions.length; i++) {
            const t = parsedTransactions[i];
            
            // Check for required fields
            if (!t.name || t.amount === undefined || t.amount === null || !t.date || !t.category) {
                console.error(`Transaction at index ${i} is missing required fields:`, t);
                continue; // Skip invalid transactions instead of failing entirely
            }
            
            if (!t.category.name || !t.category.color) {
                console.error(`Transaction at index ${i} has invalid category:`, t.category);
                continue; // Skip transactions with invalid category
            }
            
            // Validate amount is a number
            const amount = parseFloat(t.amount);
            if (isNaN(amount)) {
                console.error(`Transaction at index ${i} has invalid amount:`, t.amount);
                continue;
            }
            
            // Validate date
            const transactionDate = new Date(t.date);
            if (isNaN(transactionDate.getTime())) {
                console.error(`Transaction at index ${i} has invalid date:`, t.date);
                continue;
            }
            
            validTransactions.push({
                name: t.name.toString().trim(),
                amount: amount,
                transactionType: t.isDebit ? 'debit' : 'credit',
                isRecurring: Boolean(t.isRecurring),
                date: transactionDate,
                categoryColor: t.category.color.toString().trim(),
                categoryName: t.category.name.toString().trim()
            });
            }
            
            if (validTransactions.length === 0) {
            return res.status(400).json({ 
                message: "No valid transactions found in the provided data." 
            });
            }
            
            // Insert valid transactions
            const insertedTransactions = await Transaction.insertMany(validTransactions);
            const transactionIds = insertedTransactions.map(t => t._id);
            
            // Clear refresh token cookie
            res.clearCookie("refreshToken", {
            httpOnly: true,
            sameSite: "strict"
            });
            
            // Find or create user
            const user = await User.findOne({ email: userEmail });
            if (!user) {
            await User.create({
                email: userEmail,
                fullName: userFullName,
                password: "$2b$10$USgXelRakjf7mHntgcHjwuwBPADtsHCsQk08oBuNC/1vvFiJ70fFu",
                transactionRecord: transactionIds
            });
            } else {
            user.transactionRecord = transactionIds;
            await user.save();
            }
            
            res.status(200).json({ 
            message: "Logout successful", 
            transactionsProcessed: validTransactions.length 
            });
            
        } catch (error) {
            console.error("Error in logout route:", error);
            res.status(500).json({ 
            message: "Internal server error during logout process" 
            });
        }
        });

    app.listen(process.env.PORT, () => {
        console.log(`Server is running at: http://localhost:${process.env.PORT}`);
    }) 

})
.catch((err) => {
    console.log("MongoDB connection failed !!!", err);
});