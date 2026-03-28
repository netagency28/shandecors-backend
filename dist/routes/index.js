"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = __importDefault(require("./auth"));
const products_mock_1 = __importDefault(require("./products-mock")); // Use mock instead of database
const cart_1 = __importDefault(require("./cart"));
const orders_1 = __importDefault(require("./orders"));
const users_1 = __importDefault(require("./users"));
const admin_1 = __importDefault(require("./admin"));
const upload_1 = __importDefault(require("./upload"));
const test_1 = __importDefault(require("./test"));
const categories_mock_1 = __importDefault(require("./categories-mock")); // Use mock instead of database
const payments_1 = __importDefault(require("./payments"));
const seed_1 = __importDefault(require("./seed"));
const content_1 = __importDefault(require("./content"));
const router = (0, express_1.Router)();
router.use('/auth', auth_1.default);
router.use('/categories', categories_mock_1.default);
router.use('/products', products_mock_1.default);
router.use('/cart', cart_1.default);
router.use('/orders', orders_1.default);
router.use('/users', users_1.default);
router.use('/admin', admin_1.default);
router.use('/payments', payments_1.default);
router.use('/upload', upload_1.default);
router.use('/test', test_1.default);
router.use('/seed', seed_1.default);
router.use('/content', content_1.default);
exports.default = router;
//# sourceMappingURL=index.js.map