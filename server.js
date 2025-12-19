const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { body, validationResult, param, query } = require("express-validator");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Kết nối MongoDB
mongoose
  .connect(
    "mongodb+srv://20225414:20225414@it4409.gjsotfo.mongodb.net/it4409?appName=it4409"
  )
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Could not connect to MongoDB", err));

// Tạo Schema
const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Tên không được để trống"],
      minlength: [2, "Tên phải có ít nhất 2 ký tự"],
      trim: true,
    },
    age: {
      type: Number,
      required: [true, "Tuổi là bắt buộc"],
      min: [0, "Tuổi phải lớn hơn 0"],
      set: (v) => Math.floor(v),
    },
    email: {
      type: String,
      required: true,
      unique: true, // Đảm bảo email là duy nhất
      match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, "Email không hợp lệ"],
      lowercase: true, // Chuẩn hóa email về chữ thường
      trim: true,
    },
    address: String,
  },
  { timestamps: true }
);

const User = mongoose.model("User", UserSchema);

// Khởi động Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// --- API ROUTES ---

// Middleware để xử lý lỗi validation từ express-validator
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Lỗi dữ liệu đầu vào",
      errors: errors.array(),
    });
  }
  next();
};

// API Lấy danh sách người dùng (Sử dụng Promise.all và giới hạn page/limit)
app.get(
  "/api/users",
  [
    // Validation cho Query Params
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page phải là số nguyên >= 1")
      .toInt(),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit phải là số nguyên từ 1 đến 50")
      .toInt(),
    query("search").optional().trim(),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const page = req.query.page || 1;
      const limit = req.query.limit || 5;
      const searchKeyword = req.query.search ? req.query.search.trim() : "";

      let query = {};
      if (searchKeyword) {
        const regex = new RegExp(searchKeyword, "i");
        query = {
          $or: [
            { name: { $regex: regex } },
            { email: { $regex: regex } },
            { address: { $regex: regex } },
          ],
        };
      }

      const skip = (page - 1) * limit;

      // --- Sử dụng Promise.all cho truy vấn song song ---
      const [totalCount, paginatedData] = await Promise.all([
        User.countDocuments(query),
        User.find(query).skip(skip).limit(limit).select("-__v"),
      ]);
      // --------------------------------------------------

      const totalPages = Math.ceil(totalCount / limit);

      const currentPage =
        page > totalPages && totalPages > 0 ? totalPages : page;

      const response = {
        page: currentPage,
        limit: limit,
        total: totalCount,
        totalPages: totalPages,
        data: paginatedData,
      };

      return res.status(200).json(response);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách người dùng:", error);
      return res
        .status(500)
        .json({ error: "Lỗi máy chủ nội bộ khi truy vấn dữ liệu" });
    }
  }
);

// API Tạo người dùng
app.post(
  "/api/users",
  [
    // Validation và chuẩn hóa đầu vào
    body("name")
      .trim()
      .isLength({ min: 2 })
      .withMessage("Tên phải có ít nhất 2 ký tự"),
    body("age")
      .isInt({ min: 0 })
      .withMessage("Tuổi phải là số nguyên >= 0")
      .toInt(),
    body("email")
      .trim()
      .isEmail()
      .withMessage("Email không hợp lệ")
      .normalizeEmail({ all_lowercase: true }),
    body("address").optional().trim(),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { name, age, email, address } = req.body;

      const newUser = new User({ name, age, email, address });
      await newUser.save();

      const savedUser = newUser.toObject();
      delete savedUser.__v;

      res
        .status(201)
        .json({ message: "Tạo người dùng thành công", data: savedUser });
    } catch (error) {
      if (error.code === 11000) {
        // Lỗi trùng lặp key (email)
        return res.status(400).json({
          message: "Tạo người dùng thất bại.",
          error: "Email đã tồn tại.",
        });
      }
      res.status(400).json({
        message: "Tạo người dùng thất bại do lỗi xác thực.",
        error: error.message,
      });
    }
  }
);

// API Cập nhật người dùng
app.put(
  "/api/users/:id",
  [
    // Kiểm tra tính hợp lệ của ID
    param("id").isMongoId().withMessage("ID không hợp lệ."),
    body("name")
      .optional()
      .trim()
      .isLength({ min: 2 })
      .withMessage("Tên phải có ít nhất 2 ký tự"),
    body("age")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Tuổi phải là số nguyên >= 0")
      .toInt(),
    body("email")
      .optional()
      .trim()
      .isEmail()
      .withMessage("Email không hợp lệ")
      .normalizeEmail({ all_lowercase: true }),
    body("address").optional().trim(),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = {};

      // Chỉ thêm các trường được cung cấp vào updateData
      if (req.body.name !== undefined) updateData.name = req.body.name;
      if (req.body.age !== undefined) updateData.age = req.body.age;
      if (req.body.email !== undefined) updateData.email = req.body.email;
      if (req.body.address !== undefined) updateData.address = req.body.address;

      // Kiểm tra nếu không có trường nào để cập nhật
      if (Object.keys(updateData).length === 0) {
        return res
          .status(400)
          .json({ message: "Không có trường nào được cung cấp để cập nhật." });
      }
      // -------------------------------------------------------------------------

      const updatedUser = await User.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
        context: "query",
      }).select("-__v");

      if (!updatedUser) {
        return res.status(404).json({ error: "Người dùng không tồn tại" });
      }

      res
        .status(200)
        .json({ message: "Cập nhật người dùng thành công", data: updatedUser });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          message: "Cập nhật người dùng thất bại.",
          error: "Email đã tồn tại.",
        });
      }
      res.status(400).json({ error: error.message });
    }
  }
);

// API Xóa người dùng
app.delete(
  "/api/users/:id",
  [
    // Kiểm tra tính hợp lệ của ID
    param("id").isMongoId().withMessage("ID không hợp lệ."),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { id } = req.params;
      const deletedUser = await User.findByIdAndDelete(id);

      if (!deletedUser) {
        return res.status(404).json({ error: "Người dùng không tồn tại" });
      }

      res.status(200).json({ message: "Xóa người dùng thành công" });
    } catch (error) {
      res.status(500).json({ error: "Lỗi máy chủ" });
    }
  }
);
