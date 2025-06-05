import mongoose from "mongoose";
const transactionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    transactionType: {
        type: String,
        enum: ["credit", "debit"],
        required: true
    },
    isRecurring: {
        type: Boolean,
        default: false
    },
    date: {
        type: String,
        required: true
    },
    categoryName: {
        type: String,
        required: true
    },
    categoryColor: {
        type: String,
        required: true
    }
}, {timestamps: true});
export const Transaction = mongoose.model("Transaction", transactionSchema);