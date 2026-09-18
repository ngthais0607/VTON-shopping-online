import sys
import os
import random
from datetime import datetime, timezone, timedelta

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from sqlalchemy import or_
from app.core.database import SessionLocal, engine, Base
from app.features.users.model import User
from app.features.users.schema import hash_password
from app.features.categories.model import Category
from app.features.products.model import Product, ProductImage
from app.features.orders.model import Order, Payment

def seed_database(db=None):
    print("[SEED] Starting rich database seeding...")
    should_close = False
    if db is None:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        should_close = True

    try:
        # 1. Seed Admin User
        admin_user = db.query(User).filter(
            or_(User.email == "admin@example.com", User.username == "admin")
        ).first()

        if not admin_user:
            admin_user = User(
                first_name="System",
                last_name="Admin",
                username="admin",
                email="admin@example.com",
                password_hash=hash_password("Admin@123456"),
                role="admin"
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            print("[OK] Created Admin User: admin@example.com / Admin@123456")

        # 2. Seed Customer Users
        customer = db.query(User).filter(
            or_(User.email == "user@example.com", User.username == "demouser")
        ).first()

        if not customer:
            customer = User(
                first_name="Demo",
                last_name="Customer",
                username="demouser",
                email="user@example.com",
                password_hash=hash_password("User@123456"),
                role="customer"
            )
            db.add(customer)
            db.commit()
            db.refresh(customer)
            print("[OK] Created Customer User: user@example.com / User@123456")

        # 3. Seed Categories
        categories_data = [
            ("Electronics", "Smartphones, laptops, audio gear, and gadgets"),
            ("Fashion", "Men & Women modern apparel, shoes, and accessories"),
            ("Home & Living", "Smart appliances, furniture, and home decor"),
            ("Beauty & Care", "Skincare, cosmetics, and wellness products"),
            ("Sports & Outdoor", "Fitness equipment, camping gear, and sportswear"),
        ]

        created_categories = []
        for cat_name, cat_desc in categories_data:
            cat = db.query(Category).filter(Category.name == cat_name).first()
            if not cat:
                cat = Category(
                    name=cat_name,
                    description=cat_desc,
                    created_by=admin_user.id
                )
                db.add(cat)
                db.commit()
                db.refresh(cat)
            created_categories.append(cat)

        # 4. Seed Rich Products
        products_sample = [
            ("Wireless Noise-Canceling Headphones", 249.99, "Premium over-ear headphones with active noise cancellation and 30-hour battery life.", 45, "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=600&fit=crop&q=80", 0),
            ("Smart Watch Series Pro", 199.99, "Advanced fitness tracker with AMOLED display, heart rate monitor, and GPS.", 8, "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop&q=80", 0), # Low stock
            ("Ultra Slim Laptop 15-inch", 999.00, "Powered by latest processor, 16GB RAM, 512GB SSD in a lightweight aluminum body.", 20, "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&h=600&fit=crop&q=80", 0),
            ("Mechanical Ergonomic Keyboard", 129.50, "RGB backlit mechanical keyboard with tactile switches and wrist rest.", 5, "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&h=600&fit=crop&q=80", 0), # Low stock
            ("Minimalist Leather Backpack", 89.00, "Water-resistant genuine leather backpack with dedicated laptop sleeve.", 60, "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&h=600&fit=crop&q=80", 1),
            ("Designer Denim Jacket", 115.00, "Classic vintage denim jacket with durable stitching and modern fit.", 35, "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=600&h=600&fit=crop&q=80", 1),
            ("Urban Running Sneakers", 145.00, "Lightweight breathable running shoes with maximum cushion support.", 50, "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=600&fit=crop&q=80", 1),
            ("Automatic Espresso Coffee Machine", 349.99, "Barista-quality espresso maker with milk frother and 15-bar pump.", 15, "https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=600&h=600&fit=crop&q=80", 2),
            ("Modern Ceramic Dining Set", 179.00, "16-piece handcrafted stoneware plate and bowl set in matte finish.", 25, "https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=600&h=600&fit=crop&q=80", 2),
            ("Smart Air Purifier HEPA", 159.00, "Filters 99.97% of dust and allergens with real-time air quality sensor.", 3, "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=600&h=600&fit=crop&q=80", 2), # Low stock
            ("Organic Botanical Face Serum", 48.00, "Hydrating facial oil with Vitamin C and natural botanical extracts.", 70, "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&h=600&fit=crop&q=80", 3),
            ("Luxury Aromatherapy Diffuser", 39.99, "Ultrasonic essential oil diffuser with LED mood lighting.", 40, "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&h=600&fit=crop&q=80", 3),
            ("Insulated Stainless Water Bottle", 29.50, "Keeps drinks ice cold for 24 hours or hot for 12 hours.", 80, "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&h=600&fit=crop&q=80", 4),
            ("Non-Slip Pro Yoga Mat", 55.00, "Eco-friendly natural rubber yoga mat with alignment guidelines.", 30, "https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=600&h=600&fit=crop&q=80", 4),
        ]

        created_products = []
        for name, price, desc, stock, img_url, cat_idx in products_sample:
            prod = db.query(Product).filter(Product.name == name).first()
            if not prod:
                category_id = created_categories[cat_idx].id if cat_idx < len(created_categories) else None
                prod = Product(
                    name=name,
                    price=price,
                    description=desc,
                    stock_quantity=stock,
                    reserved_quantity=0,
                    sold_quantity=random.randint(5, 40),
                    category_id=category_id,
                    currency="USD",
                    is_active=True
                )
                db.add(prod)
                db.commit()
                db.refresh(prod)

                # Add product image
                prod_img = ProductImage(
                    id=f"img_{prod.id}",
                    product_id=prod.id,
                    object_name=img_url
                )
                db.add(prod_img)
                db.commit()
            created_products.append(prod)

        # 5. Seed Historical Orders across 30 Days for Analytics Chart
        existing_orders_count = db.query(Order).count()
        if existing_orders_count < 15 and created_products:
            statuses = ["paid", "paid", "paid", "pending", "cancelled", "expired"]
            now = datetime.now(timezone.utc)

            for i in range(35):
                # Distribute orders over past 30 days
                days_ago = random.randint(0, 28)
                created_date = now - timedelta(days=days_ago, hours=random.randint(1, 12))
                
                selected_prod = random.choice(created_products)
                qty = random.randint(1, 3)
                total = selected_prod.price * qty
                status = random.choice(statuses)

                order = Order(
                    user_id=customer.id if customer else None,
                    product_id=selected_prod.id,
                    product_name=selected_prod.name,
                    unit_price=selected_prod.price,
                    quantity=qty,
                    total_amount=total,
                    currency="USD",
                    status=status,
                    created_at=created_date,
                    paid_at=created_date + timedelta(minutes=5) if status == "paid" else None,
                    expires_at=created_date + timedelta(minutes=30) if status == "pending" else None
                )
                db.add(order)
                db.commit()
                db.refresh(order)

                # Add payment record for paid orders
                if status == "paid":
                    payment = Payment(
                        order_id=order.id,
                        provider="vietqr",
                        amount=total,
                        currency="USD",
                        status="completed",
                        paid_at=order.paid_at,
                        created_at=created_date
                    )
                    db.add(payment)
                    db.commit()

            print(f"[OK] Seeded 35 historical orders for analytics dashboard!")

        print("[SUCCESS] All rich database seeding completed successfully!")

    except Exception as e:
        print(f"[ERROR] Database seeding failed: {e}")
        db.rollback()
    finally:
        if should_close:
            db.close()

if __name__ == "__main__":
    seed_database()
