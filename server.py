from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Annotated
import uuid
from datetime import datetime, timezone
import asyncio
import resend
import httpx
import hmac
import hashlib
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Supabase Configuration
SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', '')
SUPABASE_JWT_SECRET = os.environ.get('SUPABASE_JWT_SECRET', '')

# Cashfree Configuration
CASHFREE_CLIENT_ID = os.environ.get('CASHFREE_CLIENT_ID', '')
CASHFREE_CLIENT_SECRET = os.environ.get('CASHFREE_CLIENT_SECRET', '')
CASHFREE_ENVIRONMENT = os.environ.get('CASHFREE_ENVIRONMENT', 'sandbox')
CASHFREE_API_VERSION = '2023-08-01'

# Resend Configuration
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# Create the main app
app = FastAPI(title="Home Decor Ecommerce API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer(auto_error=False)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== Models ====================

class Category(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    slug: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CategoryCreate(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    image_url: Optional[str] = None

class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    slug: str
    description: str
    price: float
    sale_price: Optional[float] = None
    category_id: str
    images: List[str] = []
    stock: int = 0
    is_featured: bool = False
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductCreate(BaseModel):
    name: str
    slug: str
    description: str
    price: float
    sale_price: Optional[float] = None
    category_id: str
    images: List[str] = []
    stock: int = 0
    is_featured: bool = False
    is_active: bool = True

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    sale_price: Optional[float] = None
    category_id: Optional[str] = None
    images: Optional[List[str]] = None
    stock: Optional[int] = None
    is_featured: Optional[bool] = None
    is_active: Optional[bool] = None

class CartItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    product_id: str
    quantity: int = 1
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CartItemCreate(BaseModel):
    product_id: str
    quantity: int = 1

class CartItemUpdate(BaseModel):
    quantity: int

class OrderItem(BaseModel):
    product_id: str
    product_name: str
    product_image: str
    price: float
    quantity: int

class ShippingAddress(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: str
    postal_code: str
    country: str = "India"

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    order_number: str = Field(default_factory=lambda: f"ORD-{str(uuid.uuid4())[:8].upper()}")
    items: List[OrderItem]
    subtotal: float
    shipping_fee: float = 0
    total: float
    status: str = "pending"  # pending, confirmed, processing, shipped, delivered, cancelled
    payment_status: str = "pending"  # pending, paid, failed, refunded
    payment_id: Optional[str] = None
    payment_session_id: Optional[str] = None
    shipping_address: ShippingAddress
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class OrderCreate(BaseModel):
    items: List[OrderItem]
    subtotal: float
    shipping_fee: float = 0
    total: float
    shipping_address: ShippingAddress
    notes: Optional[str] = None

class OrderStatusUpdate(BaseModel):
    status: str

class CreatePaymentRequest(BaseModel):
    order_id: str
    customer_email: EmailStr
    customer_phone: str
    customer_name: str

class UserProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    email: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    is_admin: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ==================== Auth Middleware ====================

async def get_current_user(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)]) -> Optional[dict]:
    if not credentials:
        return None
    
    token = credentials.credentials
    try:
        # Verify token with Supabase
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": SUPABASE_KEY
                },
                timeout=10.0
            )
            if response.status_code == 200:
                return response.json()
    except Exception as e:
        logger.error(f"Auth error: {e}")
    
    return None

async def require_auth(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)]) -> dict:
    user = await get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user

async def require_admin(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)]) -> dict:
    user = await require_auth(credentials)
    # Check if user is admin
    profile = await db.user_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    if not profile or not profile.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ==================== Email Helper ====================

async def send_order_confirmation_email(order: dict, email: str):
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured, skipping email")
        return
    
    items_html = ""
    for item in order["items"]:
        items_html += f"""
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #E5E4E0;">{item['product_name']}</td>
            <td style="padding: 12px; border-bottom: 1px solid #E5E4E0; text-align: center;">{item['quantity']}</td>
            <td style="padding: 12px; border-bottom: 1px solid #E5E4E0; text-align: right;">₹{item['price']:.2f}</td>
        </tr>
        """
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Order Confirmation</title>
    </head>
    <body style="font-family: 'DM Sans', sans-serif; background-color: #FDFCF8; margin: 0; padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; padding: 40px;">
            <h1 style="font-family: 'Playfair Display', serif; color: #1A1918; margin: 0 0 24px 0;">Order Confirmed</h1>
            
            <p style="color: #66605B; line-height: 1.6;">
                Thank you for your order! We're excited to get your items ready.
            </p>
            
            <div style="background: #F0EFEA; padding: 20px; margin: 24px 0;">
                <p style="margin: 0; color: #1A1918;"><strong>Order Number:</strong> {order['order_number']}</p>
            </div>
            
            <h2 style="font-family: 'Playfair Display', serif; color: #1A1918; font-size: 20px; margin: 32px 0 16px 0;">Order Details</h2>
            
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #F0EFEA;">
                        <th style="padding: 12px; text-align: left; color: #1A1918;">Item</th>
                        <th style="padding: 12px; text-align: center; color: #1A1918;">Qty</th>
                        <th style="padding: 12px; text-align: right; color: #1A1918;">Price</th>
                    </tr>
                </thead>
                <tbody>
                    {items_html}
                </tbody>
            </table>
            
            <div style="margin-top: 24px; padding-top: 24px; border-top: 2px solid #1A1918;">
                <p style="text-align: right; color: #1A1918; font-size: 18px; margin: 0;">
                    <strong>Total: ₹{order['total']:.2f}</strong>
                </p>
            </div>
            
            <div style="margin-top: 32px; padding: 20px; background: #F0EFEA;">
                <h3 style="font-family: 'Playfair Display', serif; color: #1A1918; margin: 0 0 12px 0;">Shipping Address</h3>
                <p style="color: #66605B; margin: 0; line-height: 1.6;">
                    {order['shipping_address']['full_name']}<br>
                    {order['shipping_address']['address_line1']}<br>
                    {order['shipping_address'].get('address_line2', '') + '<br>' if order['shipping_address'].get('address_line2') else ''}
                    {order['shipping_address']['city']}, {order['shipping_address']['state']} {order['shipping_address']['postal_code']}<br>
                    {order['shipping_address']['country']}
                </p>
            </div>
            
            <p style="color: #66605B; margin-top: 32px; line-height: 1.6;">
                If you have any questions, feel free to reply to this email.
            </p>
            
            <p style="color: #BC6C4A; margin-top: 24px;">
                Thank you for shopping with us!
            </p>
        </div>
    </body>
    </html>
    """
    
    params = {
        "from": SENDER_EMAIL,
        "to": [email],
        "subject": f"Order Confirmed - {order['order_number']}",
        "html": html_content
    }
    
    try:
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Order confirmation email sent to {email}")
    except Exception as e:
        logger.error(f"Failed to send email: {e}")

# ==================== Cashfree Payment Helper ====================

def get_cashfree_base_url():
    if CASHFREE_ENVIRONMENT == "production":
        return "https://api.cashfree.com/pg"
    return "https://sandbox.cashfree.com/pg"

def get_cashfree_headers():
    return {
        "x-client-id": CASHFREE_CLIENT_ID,
        "x-client-secret": CASHFREE_CLIENT_SECRET,
        "x-api-version": CASHFREE_API_VERSION,
        "Content-Type": "application/json"
    }

# ==================== Routes ====================

# Health Check
@api_router.get("/")
async def root():
    return {"message": "Home Decor Ecommerce API", "status": "healthy"}

# ==================== Auth Routes ====================

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(require_auth)):
    profile = await db.user_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    return {
        "user": user,
        "profile": profile
    }

@api_router.post("/auth/profile")
async def create_or_update_profile(
    data: dict,
    user: dict = Depends(require_auth)
):
    profile = await db.user_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    
    if profile:
        # Update existing profile
        update_data = {k: v for k, v in data.items() if v is not None}
        await db.user_profiles.update_one(
            {"user_id": user["id"]},
            {"$set": update_data}
        )
        profile.update(update_data)
    else:
        # Create new profile
        profile = UserProfile(
            user_id=user["id"],
            email=user.get("email", ""),
            full_name=data.get("full_name"),
            phone=data.get("phone"),
            is_admin=False
        ).model_dump()
        profile["created_at"] = profile["created_at"].isoformat()
        await db.user_profiles.insert_one(profile)
    
    return {"profile": profile}

# ==================== Category Routes ====================

@api_router.get("/categories", response_model=List[Category])
async def get_categories():
    categories = await db.categories.find({}, {"_id": 0}).to_list(100)
    for cat in categories:
        if isinstance(cat.get('created_at'), str):
            cat['created_at'] = datetime.fromisoformat(cat['created_at'])
    return categories

@api_router.get("/categories/{slug}")
async def get_category(slug: str):
    category = await db.categories.find_one({"slug": slug}, {"_id": 0})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category

@api_router.post("/admin/categories", response_model=Category)
async def create_category(data: CategoryCreate, user: dict = Depends(require_admin)):
    category = Category(**data.model_dump())
    doc = category.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.categories.insert_one(doc)
    return category

@api_router.delete("/admin/categories/{category_id}")
async def delete_category(category_id: str, user: dict = Depends(require_admin)):
    result = await db.categories.delete_one({"id": category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}

# ==================== Product Routes ====================

@api_router.get("/products")
async def get_products(
    category: Optional[str] = Query(None),
    featured: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    skip: int = Query(0)
):
    query = {"is_active": True}
    
    if category:
        query["category_id"] = category
    if featured is not None:
        query["is_featured"] = featured
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]
    
    products = await db.products.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    total = await db.products.count_documents(query)
    
    return {"products": products, "total": total}

@api_router.get("/products/{slug}")
async def get_product(slug: str):
    product = await db.products.find_one({"slug": slug, "is_active": True}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@api_router.get("/products/id/{product_id}")
async def get_product_by_id(product_id: str):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

# Admin Product Routes
@api_router.get("/admin/products")
async def admin_get_products(
    user: dict = Depends(require_admin),
    limit: int = Query(50, le=100),
    skip: int = Query(0)
):
    products = await db.products.find({}, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    total = await db.products.count_documents({})
    return {"products": products, "total": total}

@api_router.post("/admin/products", response_model=Product)
async def create_product(data: ProductCreate, user: dict = Depends(require_admin)):
    product = Product(**data.model_dump())
    doc = product.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    await db.products.insert_one(doc)
    return product

@api_router.put("/admin/products/{product_id}")
async def update_product(product_id: str, data: ProductUpdate, user: dict = Depends(require_admin)):
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    result = await db.products.update_one(
        {"id": product_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    return product

@api_router.delete("/admin/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require_admin)):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted"}

# ==================== Cart Routes ====================

@api_router.get("/cart")
async def get_cart(user: dict = Depends(require_auth)):
    cart_items = await db.cart_items.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    
    # Enrich cart items with product details
    enriched_items = []
    for item in cart_items:
        product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0})
        if product:
            enriched_items.append({
                **item,
                "product": product
            })
    
    return {"items": enriched_items}

@api_router.post("/cart")
async def add_to_cart(data: CartItemCreate, user: dict = Depends(require_auth)):
    # Check if item already exists in cart
    existing = await db.cart_items.find_one({
        "user_id": user["id"],
        "product_id": data.product_id
    }, {"_id": 0})
    
    if existing:
        # Update quantity
        new_quantity = existing["quantity"] + data.quantity
        await db.cart_items.update_one(
            {"id": existing["id"]},
            {"$set": {"quantity": new_quantity}}
        )
        existing["quantity"] = new_quantity
        return existing
    
    # Create new cart item
    cart_item = CartItem(
        user_id=user["id"],
        product_id=data.product_id,
        quantity=data.quantity
    )
    doc = cart_item.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.cart_items.insert_one(doc)
    return cart_item.model_dump()

@api_router.put("/cart/{item_id}")
async def update_cart_item(item_id: str, data: CartItemUpdate, user: dict = Depends(require_auth)):
    result = await db.cart_items.update_one(
        {"id": item_id, "user_id": user["id"]},
        {"$set": {"quantity": data.quantity}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cart item not found")
    
    item = await db.cart_items.find_one({"id": item_id}, {"_id": 0})
    return item

@api_router.delete("/cart/{item_id}")
async def remove_from_cart(item_id: str, user: dict = Depends(require_auth)):
    result = await db.cart_items.delete_one({"id": item_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cart item not found")
    return {"message": "Item removed from cart"}

@api_router.delete("/cart")
async def clear_cart(user: dict = Depends(require_auth)):
    await db.cart_items.delete_many({"user_id": user["id"]})
    return {"message": "Cart cleared"}

# ==================== Order Routes ====================

@api_router.get("/orders")
async def get_user_orders(user: dict = Depends(require_auth)):
    orders = await db.orders.find(
        {"user_id": user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"orders": orders}

@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(require_auth)):
    order = await db.orders.find_one({"id": order_id, "user_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@api_router.post("/orders")
async def create_order(data: OrderCreate, user: dict = Depends(require_auth)):
    order = Order(
        user_id=user["id"],
        items=data.items,
        subtotal=data.subtotal,
        shipping_fee=data.shipping_fee,
        total=data.total,
        shipping_address=data.shipping_address,
        notes=data.notes
    )
    
    doc = order.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    doc['shipping_address'] = data.shipping_address.model_dump()
    doc['items'] = [item.model_dump() for item in data.items]
    
    await db.orders.insert_one(doc)
    
    # Clear user's cart
    await db.cart_items.delete_many({"user_id": user["id"]})
    
    return order.model_dump()

# Guest checkout
@api_router.post("/orders/guest")
async def create_guest_order(data: OrderCreate):
    order = Order(
        user_id=None,
        items=data.items,
        subtotal=data.subtotal,
        shipping_fee=data.shipping_fee,
        total=data.total,
        shipping_address=data.shipping_address,
        notes=data.notes
    )
    
    doc = order.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    doc['shipping_address'] = data.shipping_address.model_dump()
    doc['items'] = [item.model_dump() for item in data.items]
    
    await db.orders.insert_one(doc)
    
    return order.model_dump()

# Admin Order Routes
@api_router.get("/admin/orders")
async def admin_get_orders(
    user: dict = Depends(require_admin),
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    skip: int = Query(0)
):
    query = {}
    if status:
        query["status"] = status
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.orders.count_documents(query)
    return {"orders": orders, "total": total}

@api_router.get("/admin/orders/{order_id}")
async def admin_get_order(order_id: str, user: dict = Depends(require_admin)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@api_router.put("/admin/orders/{order_id}/status")
async def update_order_status(order_id: str, data: OrderStatusUpdate, user: dict = Depends(require_admin)):
    valid_statuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]
    if data.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    result = await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": data.status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return order

# ==================== Payment Routes ====================

@api_router.post("/payments/create-order")
async def create_payment_order(data: CreatePaymentRequest):
    # Get order details
    order = await db.orders.find_one({"id": data.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if not CASHFREE_CLIENT_ID or not CASHFREE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Payment gateway not configured")
    
    # Create Cashfree order
    payload = {
        "order_id": order["order_number"],
        "order_amount": order["total"],
        "order_currency": "INR",
        "customer_details": {
            "customer_id": order.get("user_id") or f"guest_{order['id'][:8]}",
            "customer_email": data.customer_email,
            "customer_phone": data.customer_phone,
            "customer_name": data.customer_name
        },
        "order_meta": {
            "return_url": f"{os.environ.get('FRONTEND_URL', 'http://localhost:3000')}/payment/success?order_id={order['id']}",
            "notify_url": f"{os.environ.get('BACKEND_URL', 'http://localhost:8001')}/api/payments/webhook"
        }
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{get_cashfree_base_url()}/orders",
                json=payload,
                headers=get_cashfree_headers(),
                timeout=30.0
            )
            
            if response.status_code != 200:
                logger.error(f"Cashfree error: {response.text}")
                raise HTTPException(status_code=400, detail="Failed to create payment order")
            
            cf_response = response.json()
            
            # Update order with payment session
            await db.orders.update_one(
                {"id": data.order_id},
                {"$set": {
                    "payment_session_id": cf_response.get("payment_session_id"),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            return {
                "payment_session_id": cf_response.get("payment_session_id"),
                "order_id": cf_response.get("order_id"),
                "cf_order_id": cf_response.get("cf_order_id")
            }
    except httpx.HTTPError as e:
        logger.error(f"Payment creation error: {e}")
        raise HTTPException(status_code=500, detail="Payment service unavailable")

@api_router.get("/payments/verify/{order_id}")
async def verify_payment(order_id: str, background_tasks: BackgroundTasks):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if not CASHFREE_CLIENT_ID or not CASHFREE_CLIENT_SECRET:
        # Mock verification for testing without credentials
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {
                "payment_status": "paid",
                "status": "confirmed",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # Send confirmation email
        background_tasks.add_task(
            send_order_confirmation_email,
            order,
            order["shipping_address"]["email"]
        )
        
        return {
            "order_id": order_id,
            "payment_status": "paid",
            "order_status": "confirmed"
        }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{get_cashfree_base_url()}/orders/{order['order_number']}/payments",
                headers=get_cashfree_headers(),
                timeout=30.0
            )
            
            if response.status_code == 200:
                payments = response.json()
                
                if payments and len(payments) > 0:
                    latest_payment = payments[0]
                    payment_status = latest_payment.get("payment_status", "PENDING")
                    
                    if payment_status == "SUCCESS":
                        await db.orders.update_one(
                            {"id": order_id},
                            {"$set": {
                                "payment_status": "paid",
                                "payment_id": latest_payment.get("cf_payment_id"),
                                "status": "confirmed",
                                "updated_at": datetime.now(timezone.utc).isoformat()
                            }}
                        )
                        
                        # Send confirmation email
                        background_tasks.add_task(
                            send_order_confirmation_email,
                            order,
                            order["shipping_address"]["email"]
                        )
                        
                        return {
                            "order_id": order_id,
                            "payment_status": "paid",
                            "order_status": "confirmed",
                            "payment_details": latest_payment
                        }
                    elif payment_status == "FAILED":
                        await db.orders.update_one(
                            {"id": order_id},
                            {"$set": {
                                "payment_status": "failed",
                                "updated_at": datetime.now(timezone.utc).isoformat()
                            }}
                        )
                        return {
                            "order_id": order_id,
                            "payment_status": "failed",
                            "order_status": order["status"]
                        }
                
                return {
                    "order_id": order_id,
                    "payment_status": "pending",
                    "order_status": order["status"]
                }
    except Exception as e:
        logger.error(f"Payment verification error: {e}")
        raise HTTPException(status_code=500, detail="Failed to verify payment")

@api_router.post("/payments/webhook")
async def payment_webhook(request: dict, background_tasks: BackgroundTasks):
    # In production, verify webhook signature
    logger.info(f"Received payment webhook: {request}")
    
    event_type = request.get("type", "")
    data = request.get("data", {})
    
    if event_type == "PAYMENT_SUCCESS":
        order_number = data.get("order", {}).get("order_id")
        order = await db.orders.find_one({"order_number": order_number}, {"_id": 0})
        
        if order:
            await db.orders.update_one(
                {"order_number": order_number},
                {"$set": {
                    "payment_status": "paid",
                    "payment_id": data.get("payment", {}).get("cf_payment_id"),
                    "status": "confirmed",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            # Send confirmation email
            background_tasks.add_task(
                send_order_confirmation_email,
                order,
                order["shipping_address"]["email"]
            )
    
    return {"status": "received"}

# ==================== Admin Dashboard ====================

@api_router.get("/admin/dashboard/stats")
async def get_dashboard_stats(user: dict = Depends(require_admin)):
    # Total orders
    total_orders = await db.orders.count_documents({})
    
    # Orders by status
    pending_orders = await db.orders.count_documents({"status": "pending"})
    confirmed_orders = await db.orders.count_documents({"status": "confirmed"})
    processing_orders = await db.orders.count_documents({"status": "processing"})
    shipped_orders = await db.orders.count_documents({"status": "shipped"})
    delivered_orders = await db.orders.count_documents({"status": "delivered"})
    cancelled_orders = await db.orders.count_documents({"status": "cancelled"})
    
    # Total revenue (paid orders only)
    pipeline = [
        {"$match": {"payment_status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ]
    revenue_result = await db.orders.aggregate(pipeline).to_list(1)
    total_revenue = revenue_result[0]["total"] if revenue_result else 0
    
    # Total products
    total_products = await db.products.count_documents({})
    active_products = await db.products.count_documents({"is_active": True})
    
    # Recent orders
    recent_orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    
    return {
        "total_orders": total_orders,
        "orders_by_status": {
            "pending": pending_orders,
            "confirmed": confirmed_orders,
            "processing": processing_orders,
            "shipped": shipped_orders,
            "delivered": delivered_orders,
            "cancelled": cancelled_orders
        },
        "total_revenue": total_revenue,
        "total_products": total_products,
        "active_products": active_products,
        "recent_orders": recent_orders
    }

# ==================== Seed Data ====================

@api_router.post("/seed")
async def seed_data():
    """Seed initial categories and sample products"""
    
    # Check if data already exists
    existing_categories = await db.categories.count_documents({})
    if existing_categories > 0:
        return {"message": "Data already seeded"}
    
    # Create categories
    categories = [
        CategoryCreate(
            name="Lamps",
            slug="lamps",
            description="Illuminate your space with our curated collection of designer lamps",
            image_url="https://images.unsplash.com/photo-1742094561238-3325790b473b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzd8MHwxfHNlYXJjaHwzfHxtb2Rlcm4lMjBhcnRpc3RpYyUyMGxhbXAlMjB3YXJtJTIwbGlnaHR8ZW58MHx8fHwxNzcxNTExNjk0fDA&ixlib=rb-4.1.0&q=85"
        ),
        CategoryCreate(
            name="Vases",
            slug="vases",
            description="Elegant vases to complement your interior design",
            image_url="https://images.unsplash.com/photo-1762553395050-ec394919a6ea?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwyfHxtaW5pbWFsaXN0JTIwaG9tZSUyMGRlY29yJTIwY2VyYW1pYyUyMHZhc2V8ZW58MHx8fHwxNzcxNTExNjk2fDA&ixlib=rb-4.1.0&q=85"
        ),
        CategoryCreate(
            name="Home Accessories",
            slug="accessories",
            description="Thoughtfully curated accessories for modern living",
            image_url="https://images.pexels.com/photos/28345542/pexels-photo-28345542.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
        )
    ]
    
    category_ids = {}
    for cat_data in categories:
        category = Category(**cat_data.model_dump())
        doc = category.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        await db.categories.insert_one(doc)
        category_ids[cat_data.slug] = category.id
    
    # Create sample products
    products = [
        ProductCreate(
            name="Geometric Copper Pendant Light",
            slug="geometric-copper-pendant",
            description="A stunning geometric pendant light featuring a warm copper finish. This modern yet timeless piece adds sophistication to any room. Perfect for dining areas, entryways, or as a statement piece in living rooms.",
            price=12999.00,
            sale_price=10999.00,
            category_id=category_ids["lamps"],
            images=[
                "https://images.unsplash.com/photo-1758983304673-5a2d091e43e2?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBhcnRpc3RpYyUyMGxhbXAlMjB3YXJtJTIwbGlnaHR8ZW58MHx8fHwxNzcxNTExNjk0fDA&ixlib=rb-4.1.0&q=85"
            ],
            stock=15,
            is_featured=True,
            is_active=True
        ),
        ProductCreate(
            name="Minimalist Black Ceramic Vase",
            slug="minimalist-black-vase",
            description="This elegant minimalist vase features a matte black finish and clean lines. Handcrafted from premium ceramic, it serves as a striking centerpiece whether holding flowers or standing alone.",
            price=3499.00,
            category_id=category_ids["vases"],
            images=[
                "https://images.unsplash.com/photo-1762553395050-ec394919a6ea?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwyfHxtaW5pbWFsaXN0JTIwaG9tZSUyMGRlY29yJTIwY2VyYW1pYyUyMHZhc2V8ZW58MHx8fHwxNzcxNTExNjk2fDA&ixlib=rb-4.1.0&q=85"
            ],
            stock=25,
            is_featured=True,
            is_active=True
        ),
        ProductCreate(
            name="Vintage Bronze Floor Lamp",
            slug="vintage-bronze-floor-lamp",
            description="A beautiful vintage-style floor lamp with a bronze finish. Features an adjustable arm and warm ambient lighting perfect for reading corners and living spaces.",
            price=18999.00,
            sale_price=15999.00,
            category_id=category_ids["lamps"],
            images=[
                "https://images.unsplash.com/photo-1760385737142-236d61b8e622?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzd8MHwxfHNlYXJjaHw0fHxtb2Rlcm4lMjBhcnRpc3RpYyUyMGxhbXAlMjB3YXJtJTIwbGlnaHR8ZW58MHx8fHwxNzcxNTExNjk0fDA&ixlib=rb-4.1.0&q=85"
            ],
            stock=8,
            is_featured=True,
            is_active=True
        ),
        ProductCreate(
            name="Floating Wooden Wall Shelf",
            slug="floating-wooden-shelf",
            description="A beautifully crafted floating shelf made from sustainable oak. Perfect for displaying your cherished items, books, or plants. Easy to install with hidden brackets.",
            price=4999.00,
            category_id=category_ids["accessories"],
            images=[
                "https://images.pexels.com/photos/28055256/pexels-photo-28055256.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
            ],
            stock=30,
            is_featured=True,
            is_active=True
        ),
        ProductCreate(
            name="Artisan Terracotta Pot Set",
            slug="artisan-terracotta-pot-set",
            description="A set of three handmade terracotta pots in varying sizes. Each piece is uniquely crafted with organic shapes and natural textures. Perfect for indoor plants.",
            price=2999.00,
            category_id=category_ids["vases"],
            images=[
                "https://images.pexels.com/photos/28345542/pexels-photo-28345542.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
            ],
            stock=20,
            is_featured=False,
            is_active=True
        ),
        ProductCreate(
            name="Modern Glass Table Lamp",
            slug="modern-glass-table-lamp",
            description="A contemporary table lamp with a hand-blown glass base and linen shade. Creates a soft, diffused light ideal for bedside tables or living room accents.",
            price=7999.00,
            category_id=category_ids["lamps"],
            images=[
                "https://images.unsplash.com/photo-1742094561238-3325790b473b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzd8MHwxfHNlYXJjaHwzfHxtb2Rlcm4lMjBhcnRpc3RpYyUyMGxhbXAlMjB3YXJtJTIwbGlnaHR8ZW58MHx8fHwxNzcxNTExNjk0fDA&ixlib=rb-4.1.0&q=85"
            ],
            stock=18,
            is_featured=False,
            is_active=True
        )
    ]
    
    for prod_data in products:
        product = Product(**prod_data.model_dump())
        doc = product.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['updated_at'] = doc['updated_at'].isoformat()
        await db.products.insert_one(doc)
    
    # Create admin user profile (for testing)
    admin_profile = {
        "id": str(uuid.uuid4()),
        "user_id": "admin-test-user",
        "email": "admin@example.com",
        "full_name": "Admin User",
        "is_admin": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.user_profiles.insert_one(admin_profile)
    
    return {
        "message": "Data seeded successfully",
        "categories": len(categories),
        "products": len(products)
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
