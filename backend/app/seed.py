import os
import random
import sys
from datetime import datetime, timedelta, timezone

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from sqlalchemy import or_

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.core.slug import slugify
from app.features.categories.model import Category
from app.features.orders.model import Order, OrderItem, Payment
from app.features.products.model import Product, ProductImage
from app.features.products.variant_model import ProductVariant
from app.features.users.model import User


def seed_database(db=None, force: bool = False):
    app_env = os.getenv("APP_ENV", "development").lower()
    if app_env == "production" and not force:
        raise RuntimeError("Refusing to seed in production without --force")

    print(f"[SEED] Starting TrueLook fashion database seeding (env: {app_env})...")
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        is_production = app_env == "production"

        # 1. Seed Admin User
        admin_user = (
            db.query(User)
            .filter(or_(User.email == "admin@example.com", User.username == "admin"))
            .first()
        )

        if not admin_user:
            admin_user = User(
                first_name="System",
                last_name="Admin",
                username="admin",
                email="admin@example.com",
                password_hash=hash_password("Admin@123456"),
                role="admin",
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            admin_pwd = "[REDACTED]" if is_production else "Admin@123456"
            print(f"[OK] Created Admin User: admin@example.com / {admin_pwd}")

        # 2. Seed Customer User
        customer = (
            db.query(User)
            .filter(or_(User.email == "user@example.com", User.username == "demouser"))
            .first()
        )

        if not customer:
            customer = User(
                first_name="Demo",
                last_name="Customer",
                username="demouser",
                email="user@example.com",
                password_hash=hash_password("User@123456"),
                role="customer",
            )
            db.add(customer)
            db.commit()
            db.refresh(customer)
            cust_pwd = "[REDACTED]" if is_production else "User@123456"
            print(f"[OK] Created Customer User: user@example.com / {cust_pwd}")

        # 3. Clean up legacy non-fashion categories & products (Electronics, Furniture, etc.)
        legacy_cat_names = [
            "Electronics",
            "Home & Living",
            "Beauty & Care",
            "Sports & Outdoor",
        ]
        legacy_cats = (
            db.query(Category).filter(Category.name.in_(legacy_cat_names)).all()
        )
        for lcat in legacy_cats:
            legacy_prods = (
                db.query(Product).filter(Product.category_id == lcat.id).all()
            )
            for lp in legacy_prods:
                has_orders = (
                    db.query(OrderItem).filter(OrderItem.product_id == lp.id).count()
                    > 0
                )
                if has_orders:
                    lp.is_active = False
                    lp.category_id = None
                else:
                    db.query(ProductImage).filter(
                        ProductImage.product_id == lp.id
                    ).delete()
                    db.delete(lp)
            lcat.is_deleted = True
        db.commit()

        # 4. Seed Fashion Categories & Subcategories
        fashion_categories_tree = [
            {
                "name": "Áo",
                "slug": "ao",
                "description": "Bộ sưu tập áo nam, nữ, unisex thời thượng",
                "children": [
                    {
                        "name": "Áo thun",
                        "slug": "ao-thun",
                        "description": "Áo thun T-shirt cotton, oversize thoáng mát",
                    },
                    {
                        "name": "Áo sơ mi",
                        "slug": "ao-so-mi",
                        "description": "Áo sơ mi oxford, lụa công sở và dạo phố",
                    },
                    {
                        "name": "Áo polo",
                        "slug": "ao-polo",
                        "description": "Áo polo pique lịch lãm thể thao",
                    },
                ],
            },
            {
                "name": "Quần",
                "slug": "quan",
                "description": "Quần jeans, quần tây, quần short phom chuẩn",
                "children": [
                    {
                        "name": "Quần jeans",
                        "slug": "quan-jeans",
                        "description": "Quần jeans denim co giãn, đứng phom",
                    },
                    {
                        "name": "Quần tây",
                        "slug": "quan-tay",
                        "description": "Quần tây âu xếp ly thanh lịch",
                    },
                    {
                        "name": "Quần short",
                        "slug": "quan-short",
                        "description": "Quần short kaki, thun năng động",
                    },
                ],
            },
            {
                "name": "Váy & Đầm",
                "slug": "vay-dam",
                "description": "Đầm dạ tiệc, đầm xòe và chân váy nữ tính",
                "children": [
                    {
                        "name": "Đầm dáng xòe",
                        "slug": "dam-dang-xoe",
                        "description": "Đầm xòe hoa nhí, vintage duyên dáng",
                    },
                    {
                        "name": "Chân váy chữ A",
                        "slug": "chan-vay-chu-a",
                        "description": "Chân váy chữ A tôn dáng thanh thoát",
                    },
                    {
                        "name": "Đầm dạ hội",
                        "slug": "dam-da-hoi",
                        "description": "Đầm dạ hội satin sang trọng quý phái",
                    },
                ],
            },
            {
                "name": "Áo khoác",
                "slug": "ao-khoac",
                "description": "Blazer, bomber, hoodie giữ ấm phong cách",
                "children": [
                    {
                        "name": "Áo blazer",
                        "slug": "ao-blazer",
                        "description": "Áo khoác blazer thanh lịch hiện đại",
                    },
                    {
                        "name": "Áo hoodie",
                        "slug": "ao-hoodie",
                        "description": "Áo hoodie nỉ bông streetwear năng động",
                    },
                    {
                        "name": "Áo khoác bomber",
                        "slug": "ao-khoac-bomber",
                        "description": "Áo khoác bomber kaki cá tính",
                    },
                ],
            },
            {
                "name": "Giày",
                "slug": "giay",
                "description": "Sneaker, cao gót, loafer da thật cao cấp",
                "children": [
                    {
                        "name": "Giày sneaker",
                        "slug": "giay-sneaker",
                        "description": "Sneaker đế êm ái linh hoạt mọi địa hình",
                    },
                    {
                        "name": "Giày cao gót",
                        "slug": "giay-cao-got",
                        "description": "Giày cao gót mũi nhọn quý phái",
                    },
                    {
                        "name": "Giày loafer",
                        "slug": "giay-loafer",
                        "description": "Giày loafer lười da bò phong cách cổ điển",
                    },
                ],
            },
            {
                "name": "Phụ kiện",
                "slug": "phu-kien",
                "description": "Túi xách, thắt lưng da và kính mát thời trang",
                "children": [
                    {
                        "name": "Túi xách",
                        "slug": "tui-xach",
                        "description": "Túi tote, túi đeo chéo da và canvas",
                    },
                    {
                        "name": "Thắt lưng",
                        "slug": "that-lung",
                        "description": "Thắt lưng da khóa kim loại bền bỉ",
                    },
                    {
                        "name": "Kính mát",
                        "slug": "kinh-mat",
                        "description": "Kính mát phân cực chống tia UV400",
                    },
                ],
            },
        ]

        category_map = {}
        for parent_data in fashion_categories_tree:
            p_cat = (
                db.query(Category).filter(Category.slug == parent_data["slug"]).first()
            )
            if not p_cat:
                p_cat = Category(
                    name=parent_data["name"],
                    slug=parent_data["slug"],
                    description=parent_data["description"],
                    created_by=admin_user.id,
                )
                db.add(p_cat)
                db.commit()
                db.refresh(p_cat)
            category_map[parent_data["slug"]] = p_cat

            for child_data in parent_data.get("children", []):
                c_cat = (
                    db.query(Category)
                    .filter(Category.slug == child_data["slug"])
                    .first()
                )
                if not c_cat:
                    c_cat = Category(
                        name=child_data["name"],
                        slug=child_data["slug"],
                        description=child_data["description"],
                        parent_id=p_cat.id,
                        created_by=admin_user.id,
                    )
                    db.add(c_cat)
                    db.commit()
                    db.refresh(c_cat)
                elif c_cat.parent_id != p_cat.id:
                    c_cat.parent_id = p_cat.id
                    db.commit()
                category_map[child_data["slug"]] = c_cat

        print(f"[OK] Seeded {len(category_map)} fashion categories & subcategories.")

        # 5. Seed 18 Curated Fashion Products with Variants and Size Charts
        apparel_size_chart = {
            "unit": "cm",
            "measurements": [
                {"size": "S", "chest": 92, "waist": 76, "length": 68},
                {"size": "M", "chest": 96, "waist": 80, "length": 70},
                {"size": "L", "chest": 100, "waist": 84, "length": 72},
                {"size": "XL", "chest": 104, "waist": 88, "length": 74},
            ],
        }

        bottoms_size_chart = {
            "unit": "cm",
            "measurements": [
                {"size": "29", "waist": 74, "hips": 92, "length": 98},
                {"size": "30", "waist": 76, "hips": 94, "length": 99},
                {"size": "31", "waist": 79, "hips": 97, "length": 100},
                {"size": "32", "waist": 82, "hips": 100, "length": 101},
            ],
        }

        dress_size_chart = {
            "unit": "cm",
            "measurements": [
                {"size": "XS", "bust": 82, "waist": 64, "length": 110},
                {"size": "S", "bust": 86, "waist": 68, "length": 112},
                {"size": "M", "bust": 90, "waist": 72, "length": 114},
                {"size": "L", "bust": 94, "waist": 76, "length": 116},
            ],
        }

        shoes_size_chart = {
            "unit": "cm",
            "measurements": [
                {"size": "38", "foot_length": 24.0},
                {"size": "39", "foot_length": 24.5},
                {"size": "40", "foot_length": 25.0},
                {"size": "41", "foot_length": 25.5},
                {"size": "42", "foot_length": 26.0},
            ],
        }

        accessory_size_chart = {
            "unit": "cm",
            "measurements": [
                {"size": "ONE_SIZE", "width": 35, "height": 40, "depth": 10},
            ],
        }

        products_data = [
            {
                "name": "Áo Thun Cotton Compact Basic",
                "slug": "ao-thun-cotton-compact-basic",
                "price": 290000.0,
                "description": "Áo thun cotton compact 250gsm co giãn 4 chiều, xử lý chống nhăn và bai dão.",
                "brand": "TrueLook",
                "gender": "unisex",
                "material": "100% Cotton Compact",
                "fit": "Regular Fit",
                "care_instructions": "Giặt máy nước lạnh, không dùng chất tẩy mạnh, phơi bóng râm.",
                "category_slug": "ao-thun",
                "size_chart": apparel_size_chart,
                "image_url": "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("S", "Trắng", "#FFFFFF", 30),
                    ("M", "Trắng", "#FFFFFF", 45),
                    ("L", "Trắng", "#FFFFFF", 40),
                    ("XL", "Trắng", "#FFFFFF", 25),
                    ("S", "Đen", "#000000", 35),
                    ("M", "Đen", "#000000", 50),
                    ("L", "Đen", "#000000", 30),
                ],
            },
            {
                "name": "Áo Sơ Mi Oxford Dài Tay",
                "slug": "ao-so-mi-oxford-dai-tay",
                "price": 450000.0,
                "description": "Áo sơ mi vải oxford dệt sợi đôi bền bỉ, cúc ngọc trai sang trọng, form dáng công sở.",
                "brand": "TrueLook Atelier",
                "gender": "male",
                "material": "100% Cotton Oxford",
                "fit": "Slim Fit",
                "care_instructions": "Ủi ở nhiệt độ trung bình, giặt tay hoặc giặt máy chế độ nhẹ.",
                "category_slug": "ao-so-mi",
                "size_chart": apparel_size_chart,
                "image_url": "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("S", "Trắng", "#FFFFFF", 20),
                    ("M", "Trắng", "#FFFFFF", 35),
                    ("L", "Trắng", "#FFFFFF", 30),
                    ("S", "Xanh Nhạt", "#ADD8E6", 25),
                    ("M", "Xanh Nhạt", "#ADD8E6", 30),
                    ("L", "Xanh Nhạt", "#ADD8E6", 20),
                ],
            },
            {
                "name": "Áo Polo Pique Thoáng Khí",
                "slug": "ao-polo-pique-thoang-khi",
                "price": 380000.0,
                "description": "Áo polo dệt vân cá sấu pique thấm hút mồ hôi vượt trội, viền cổ dệt jacquard tinh tế.",
                "brand": "TrueLook",
                "gender": "male",
                "material": "95% Cotton, 5% Spandex",
                "fit": "Regular Fit",
                "care_instructions": "Giặt mặt trái, không vắt xoắn mạnh, là hơi nước nhiệt độ vừa.",
                "category_slug": "ao-polo",
                "size_chart": apparel_size_chart,
                "image_url": "https://images.unsplash.com/photo-1625910513413-7e44a0342629?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("M", "Xanh Navy", "#000080", 25),
                    ("L", "Xanh Navy", "#000080", 30),
                    ("XL", "Xanh Navy", "#000080", 15),
                    ("M", "Đen", "#000000", 30),
                    ("L", "Đen", "#000000", 25),
                ],
            },
            {
                "name": "Quần Jeans Slim Fit Co Giãn",
                "slug": "quan-jeans-slim-fit-co-gian",
                "price": 550000.0,
                "description": "Quần jeans wash nhẹ phong cách bụi bặm hiện đại, chất denim co giãn thoải mái khi vận động.",
                "brand": "TrueLook Denim",
                "gender": "male",
                "material": "98% Cotton, 2% Elastane",
                "fit": "Slim Fit",
                "care_instructions": "Giặt riêng với đồ sáng màu trong lần giặt đầu, phơi mặt trái.",
                "category_slug": "quan-jeans",
                "size_chart": bottoms_size_chart,
                "image_url": "https://images.unsplash.com/photo-1542272604-780c96856592?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("29", "Xanh Indigo", "#1A2B4C", 20),
                    ("30", "Xanh Indigo", "#1A2B4C", 30),
                    ("31", "Xanh Indigo", "#1A2B4C", 35),
                    ("32", "Xanh Indigo", "#1A2B4C", 25),
                    ("30", "Đen", "#000000", 25),
                    ("31", "Đen", "#000000", 20),
                ],
            },
            {
                "name": "Quần Tây Xếp Ly Cao Cấp",
                "slug": "quan-tay-xep-ly-cao-cap",
                "price": 620000.0,
                "description": "Quần tây phom suông xếp ly đôi phong cách sartorial, chất vải dạ tuyết không bám bụi.",
                "brand": "TrueLook Atelier",
                "gender": "unisex",
                "material": "Poly-Viscose Wool Blend",
                "fit": "Relaxed Fit",
                "care_instructions": "Khuyên giặt khô hoặc giặt nhẹ, treo móc chuyên dụng.",
                "category_slug": "quan-tay",
                "size_chart": bottoms_size_chart,
                "image_url": "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("29", "Xám Đậm", "#333333", 15),
                    ("30", "Xám Đậm", "#333333", 25),
                    ("31", "Xám Đậm", "#333333", 20),
                    ("30", "Beigie", "#F5F5DC", 20),
                    ("31", "Beigie", "#F5F5DC", 18),
                ],
            },
            {
                "name": "Quần Short Kaki Chino",
                "slug": "quan-short-kaki-chino",
                "price": 320000.0,
                "description": "Quần short kaki chino ngang gối, đường may gia cố chắc chắn, phù hợp mùa hè năng động.",
                "brand": "TrueLook",
                "gender": "male",
                "material": "100% Khaki Cotton",
                "fit": "Regular Fit",
                "care_instructions": "Giặt máy nhiệt độ thường, là ở nhiệt độ cao khi vải còn ẩm.",
                "category_slug": "quan-short",
                "size_chart": bottoms_size_chart,
                "image_url": "https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("29", "Be", "#D2B48C", 20),
                    ("30", "Be", "#D2B48C", 30),
                    ("31", "Be", "#D2B48C", 25),
                    ("30", "Xanh Rêu", "#556B2F", 20),
                    ("31", "Xanh Rêu", "#556B2F", 15),
                ],
            },
            {
                "name": "Đầm Xòe Hoa Nhí Vintage",
                "slug": "dam-xoe-hoa-nhi-vintage",
                "price": 680000.0,
                "description": "Đầm voan hoa nhí cổ vuông tay bồng tiểu thư, tùng váy xếp tầng bay bổng.",
                "brand": "TrueLook Flora",
                "gender": "female",
                "material": "Voan lụa Hàn Quốc",
                "fit": "Fit & Flare",
                "care_instructions": "Giặt tay nhẹ nhàng bằng dầu gội hoặc nước giặt dịu nhẹ.",
                "category_slug": "dam-dang-xoe",
                "size_chart": dress_size_chart,
                "image_url": "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("XS", "Vàng Pastel", "#FFFACD", 15),
                    ("S", "Vàng Pastel", "#FFFACD", 25),
                    ("M", "Vàng Pastel", "#FFFACD", 20),
                    ("S", "Xanh Pastel", "#E0FFFF", 20),
                    ("M", "Xanh Pastel", "#E0FFFF", 22),
                ],
            },
            {
                "name": "Chân Váy Xếp Ly Chữ A",
                "slug": "chan-vay-xep-ly-chu-a",
                "price": 390000.0,
                "description": "Chân váy chữ A cạp cao tôn dáng, có quần bảo hộ bên trong tiện lợi khi di chuyển.",
                "brand": "TrueLook Studio",
                "gender": "female",
                "material": "Tuyết mưa cao cấp",
                "fit": "A-Line",
                "care_instructions": "Treo móc kẹp chân váy, là hơi nước nhẹ nhàng.",
                "category_slug": "chan-vay-chu-a",
                "size_chart": dress_size_chart,
                "image_url": "https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("S", "Đen", "#000000", 25),
                    ("M", "Đen", "#000000", 30),
                    ("L", "Đen", "#000000", 15),
                    ("S", "Nâu Tây", "#8B4513", 20),
                    ("M", "Nâu Tây", "#8B4513", 20),
                ],
            },
            {
                "name": "Đầm Dạ Hội Lụa Satin Cổ V",
                "slug": "dam-da-hoi-lua-satin-co-v",
                "price": 1250000.0,
                "description": "Thiết kế đầm dạ hội trơn chất liệu satin bóng kiêu sa, đường xẻ tà quyến rũ cho buổi tiệc đêm.",
                "brand": "TrueLook Couture",
                "gender": "female",
                "material": "100% Silk Satin",
                "fit": "Slim Fit",
                "care_instructions": "Chỉ giặt khô tại tiệm giặt uy tín, không để tiếp xúc chất cồn.",
                "category_slug": "dam-da-hoi",
                "size_chart": dress_size_chart,
                "image_url": "https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("S", "Đỏ Rượu", "#800020", 12),
                    ("M", "Đỏ Rượu", "#800020", 15),
                    ("S", "Đen Tuyền", "#0B0B0B", 14),
                    ("M", "Đen Tuyền", "#0B0B0B", 18),
                ],
            },
            {
                "name": "Áo Blazer Linen 2 Hàng Khuy",
                "slug": "ao-blazer-linen-2-hang-khuy",
                "price": 890000.0,
                "description": "Blazer phom rộng cấu trúc thoải mái dệt từ sợi lanh tự nhiên, thoáng khí cho 4 mùa.",
                "brand": "TrueLook Atelier",
                "gender": "unisex",
                "material": "100% Linen tự nhiên",
                "fit": "Oversized",
                "care_instructions": "Giặt tay nhẹ với nước lạnh, giũ thẳng khi phơi để giữ nếp sợi tự nhiên.",
                "category_slug": "ao-blazer",
                "size_chart": apparel_size_chart,
                "image_url": "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("S", "Be Tự Nhiên", "#E8DCC4", 15),
                    ("M", "Be Tự Nhiên", "#E8DCC4", 25),
                    ("L", "Be Tự Nhiên", "#E8DCC4", 20),
                    ("S", "Nâu Đất", "#795548", 15),
                    ("M", "Nâu Đất", "#795548", 18),
                ],
            },
            {
                "name": "Áo Hoodie Nỉ Bông Phom Rộng",
                "slug": "ao-hoodie-ni-bong-phom-rong",
                "price": 490000.0,
                "description": "Áo hoodie nỉ chân cua định lượng 380gsm giữ ấm tối đa, mũ 2 lớp đứng phom dày dặn.",
                "brand": "TrueLook Street",
                "gender": "unisex",
                "material": "80% Cotton, 20% Polyester",
                "fit": "Oversized",
                "care_instructions": "Không giặt nước nóng, lộn trái khi giặt và phơi.",
                "category_slug": "ao-hoodie",
                "size_chart": apparel_size_chart,
                "image_url": "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("M", "Xám Ghi", "#9E9E9E", 25),
                    ("L", "Xám Ghi", "#9E9E9E", 30),
                    ("XL", "Xám Ghi", "#9E9E9E", 20),
                    ("M", "Đen", "#1C1C1C", 30),
                    ("L", "Đen", "#1C1C1C", 25),
                ],
            },
            {
                "name": "Áo Khoác Bomber Kaki Lót Dù",
                "slug": "ao-khoac-bomber-kaki-lot-du",
                "price": 750000.0,
                "description": "Áo bomber phong cách quân đội với khóa kéo kim loại YKK trơn tru, bo chun dệt dẻo dai.",
                "brand": "TrueLook Street",
                "gender": "male",
                "material": "Kaki Cotton ngoài & Nylon dù lót",
                "fit": "Regular Fit",
                "care_instructions": "Giặt tay nhẹ nhàng hoặc giặt máy chu kỳ ngắn với túi giặt.",
                "category_slug": "ao-khoac-bomber",
                "size_chart": apparel_size_chart,
                "image_url": "https://images.unsplash.com/photo-1548883354-7622d03aca27?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("M", "Xanh Rêu", "#3D5229", 20),
                    ("L", "Xanh Rêu", "#3D5229", 25),
                    ("XL", "Xanh Rêu", "#3D5229", 15),
                    ("M", "Đen", "#000000", 25),
                    ("L", "Đen", "#000000", 20),
                ],
            },
            {
                "name": "Sneaker Da Classic Retro",
                "slug": "sneaker-da-classic-retro",
                "price": 890000.0,
                "description": "Giày sneaker tối giản chất liệu da microfiber cao cấp, đế cao su lưu hóa êm ái chống trơn trượt.",
                "brand": "TrueLook Footwear",
                "gender": "unisex",
                "material": "Da Microfiber & Cao su đúc",
                "fit": "True to size",
                "care_instructions": "Dùng khăn ẩm lau sạch, tránh phơi trực tiếp dưới ánh nắng gắt.",
                "category_slug": "giay-sneaker",
                "size_chart": shoes_size_chart,
                "image_url": "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("38", "Trắng", "#FFFFFF", 15),
                    ("39", "Trắng", "#FFFFFF", 25),
                    ("40", "Trắng", "#FFFFFF", 30),
                    ("41", "Trắng", "#FFFFFF", 28),
                    ("42", "Trắng", "#FFFFFF", 20),
                    ("40", "Trắng Phối Xanh", "#E6F0FA", 18),
                    ("41", "Trắng Phối Xanh", "#E6F0FA", 20),
                ],
            },
            {
                "name": "Giày Cao Gót Mũi Nhọn 7cm",
                "slug": "giay-cao-got-mui-nhon-7cm",
                "price": 590000.0,
                "description": "Giày cao gót thanh lịch với độ cao 7cm hoàn hảo cho vóc dáng, đệm lót gót êm chân không gây đau mỏi.",
                "brand": "TrueLook Elegance",
                "gender": "female",
                "material": "Da bóng tổng hợp cao cấp",
                "fit": "Standard",
                "care_instructions": "Lau sạch bằng khăn mềm khô, bảo quản nơi thoáng mát trong hộp giày.",
                "category_slug": "giay-cao-got",
                "size_chart": shoes_size_chart,
                "image_url": "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("35", "Đen", "#000000", 10),
                    ("36", "Đen", "#000000", 18),
                    ("37", "Đen", "#000000", 25),
                    ("38", "Đen", "#000000", 20),
                    ("36", "Nude", "#E3BC9A", 15),
                    ("37", "Nude", "#E3BC9A", 20),
                ],
            },
            {
                "name": "Giày Loafer Da Đế Cao Su",
                "slug": "giay-loafer-da-de-cao-su",
                "price": 950000.0,
                "description": "Loafer penny cổ điển làm từ da bò tấm dập vân mềm, đế cao su chống mài mòn cho quý ông thanh lịch.",
                "brand": "TrueLook Footwear",
                "gender": "male",
                "material": "Da bò tự nhiên",
                "fit": "Standard",
                "care_instructions": "Đánh xi dưỡng da định kỳ mỗi tháng, dùng cây giữ phom giày khi không sử dụng.",
                "category_slug": "giay-loafer",
                "size_chart": shoes_size_chart,
                "image_url": "https://images.unsplash.com/photo-1614252369475-531eba835eb1?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("39", "Nâu Đen", "#3B2F2F", 12),
                    ("40", "Nâu Đen", "#3B2F2F", 20),
                    ("41", "Nâu Đen", "#3B2F2F", 22),
                    ("42", "Nâu Đen", "#3B2F2F", 16),
                    ("40", "Đen", "#1A1A1A", 18),
                    ("41", "Đen", "#1A1A1A", 20),
                ],
            },
            {
                "name": "Túi Tote Canvas Đa Năng",
                "slug": "tui-tote-canvas-da-nang",
                "price": 250000.0,
                "description": "Túi tote vải bố 16oz dày dặn có ngăn chứa đồ tiện dụng và khóa kéo an toàn, quai đeo chịu lực 15kg.",
                "brand": "TrueLook Essentials",
                "gender": "unisex",
                "material": "Canvas Cotton 16oz",
                "fit": "Freesize",
                "care_instructions": "Giặt tay nước lạnh, phơi tự nhiên, không sấy nhiệt.",
                "category_slug": "tui-xach",
                "size_chart": accessory_size_chart,
                "image_url": "https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("ONE_SIZE", "Trắng Kem", "#FAF0E6", 40),
                    ("ONE_SIZE", "Đen", "#000000", 35),
                ],
            },
            {
                "name": "Thắt Lưng Da Khóa Kim Loại",
                "slug": "that-lung-da-khoa-kim-loai",
                "price": 350000.0,
                "description": "Thắt lưng da bò nguyên tấm xử lý cạnh sơn bóng thủ công, mặt khóa hợp kim không gỉ bền màu.",
                "brand": "TrueLook Accessories",
                "gender": "male",
                "material": "Da bò nguyên tấm & Hợp kim kẽm",
                "fit": "Điều chỉnh",
                "care_instructions": "Lau bằng khăn mềm hơi ẩm, tránh tiếp xúc trực tiếp với nước mưa lâu ngày.",
                "category_slug": "that-lung",
                "size_chart": accessory_size_chart,
                "image_url": "https://images.unsplash.com/photo-1624222247344-550fb60583dc?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("ONE_SIZE", "Đen", "#000000", 30),
                    ("ONE_SIZE", "Nâu Cà Phê", "#4A2C2A", 25),
                ],
            },
            {
                "name": "Kính Mát Phân Cực UV400",
                "slug": "kinh-mat-phan-cuc-uv400",
                "price": 420000.0,
                "description": "Kính mát mắt vuông hiện đại gọng acetate cao cấp, tròng kính phân cực TAC bảo vệ mắt chống chói.",
                "brand": "TrueLook Eyewear",
                "gender": "unisex",
                "material": "Gọng Acetate, Tròng Polarized TAC",
                "fit": "Standard",
                "care_instructions": "Lau tròng kính bằng khăn chuyên dụng, cất vào hộp cứng khi không dùng.",
                "category_slug": "kinh-mat",
                "size_chart": accessory_size_chart,
                "image_url": "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800&h=1000&fit=crop&q=80",
                "variants": [
                    ("ONE_SIZE", "Đen Khói", "#2B2B2B", 35),
                    ("ONE_SIZE", "Đồi Mồi", "#5C4033", 25),
                ],
            },
        ]

        created_products = []
        for pdata in products_data:
            cat = category_map.get(pdata["category_slug"])
            prod = db.query(Product).filter(Product.slug == pdata["slug"]).first()
            if not prod:
                prod = Product(
                    name=pdata["name"],
                    slug=pdata["slug"],
                    price=pdata["price"],
                    description=pdata["description"],
                    brand=pdata["brand"],
                    gender=pdata["gender"],
                    material=pdata["material"],
                    fit=pdata["fit"],
                    care_instructions=pdata["care_instructions"],
                    size_chart=pdata["size_chart"],
                    category_id=cat.id if cat else None,
                    currency="VND",
                    is_active=True,
                )
                db.add(prod)
                db.commit()
                db.refresh(prod)
            else:
                # Update attributes in case seed changed
                prod.name = pdata["name"]
                prod.price = pdata["price"]
                prod.description = pdata["description"]
                prod.brand = pdata["brand"]
                prod.gender = pdata["gender"]
                prod.material = pdata["material"]
                prod.fit = pdata["fit"]
                prod.care_instructions = pdata["care_instructions"]
                prod.size_chart = pdata["size_chart"]
                if cat:
                    prod.category_id = cat.id
                prod.currency = "VND"
                prod.is_active = True
                db.commit()

            # Seed Image if not existing
            img = (
                db.query(ProductImage)
                .filter(ProductImage.product_id == prod.id)
                .first()
            )
            if not img:
                img = ProductImage(
                    id=f"img_{prod.id}_1",
                    product_id=prod.id,
                    object_name=pdata["image_url"],
                    is_primary=True,
                    sort_order=0,
                )
                db.add(img)
                db.commit()

            # Seed Variants
            for v_size, v_color, v_hex, v_stock in pdata["variants"]:
                existing_v = (
                    db.query(ProductVariant)
                    .filter(
                        ProductVariant.product_id == prod.id,
                        ProductVariant.size == v_size,
                        ProductVariant.color_name == v_color,
                    )
                    .first()
                )
                color_slug = slugify(v_color).upper()
                sku = f"{pdata['slug'][:12].upper()}-{v_size}-{color_slug}"
                if not existing_v:
                    new_v = ProductVariant(
                        product_id=prod.id,
                        sku=sku,
                        size=v_size,
                        color_name=v_color,
                        color_hex=v_hex,
                        price=pdata["price"],
                        stock_quantity=v_stock,
                        reserved_quantity=0,
                        sold_quantity=0,
                        is_active=True,
                    )
                    db.add(new_v)
                    db.commit()

            created_products.append(prod)

        print(
            f"[OK] Seeded {len(created_products)} fashion products with variant matrices."
        )

        # 6. Seed Historical Orders across 30 Days (Idempotent: only if count < 15)
        existing_orders_count = db.query(Order).count()
        if existing_orders_count < 15 and created_products:
            statuses = ["paid", "paid", "paid", "pending", "cancelled", "expired"]
            now = datetime.now(timezone.utc)

            # Gather all active variants across products
            all_variants = (
                db.query(ProductVariant)
                .filter(ProductVariant.is_active.is_(True))
                .all()
            )
            if all_variants:
                for i in range(35):
                    days_ago = random.randint(0, 28)
                    created_date = now - timedelta(
                        days=days_ago, hours=random.randint(1, 12)
                    )

                    selected_var = random.choice(all_variants)
                    selected_prod = (
                        db.query(Product)
                        .filter(Product.id == selected_var.product_id)
                        .first()
                    )
                    qty = random.randint(1, 2)
                    unit_price = float(selected_var.price or selected_prod.price)
                    total = unit_price * qty
                    status = random.choice(statuses)

                    order = Order(
                        user_id=customer.id if customer else None,
                        product_id=selected_prod.id,
                        product_name=selected_prod.name,
                        unit_price=unit_price,
                        quantity=qty,
                        total_amount=total,
                        currency="VND",
                        status=status,
                        customer_name=customer.full_name
                        if customer
                        else "Khách Hàng Mẫu",
                        customer_phone="0912345678",
                        shipping_address="72 Lê Thánh Tôn, Bến Nghé, Quận 1, TP. Hồ Chí Minh",
                        notes="Đơn hàng mẫu thử nghiệm",
                        payment_method="vietqr",
                        created_at=created_date,
                        paid_at=created_date + timedelta(minutes=5)
                        if status == "paid"
                        else None,
                        expires_at=created_date + timedelta(minutes=30)
                        if status == "pending"
                        else None,
                    )
                    db.add(order)
                    db.commit()
                    db.refresh(order)

                    order_item = OrderItem(
                        order_id=order.id,
                        product_id=selected_prod.id,
                        variant_id=selected_var.id,
                        sku=selected_var.sku,
                        size=selected_var.size,
                        color_name=selected_var.color_name,
                        product_name=selected_prod.name,
                        unit_price=unit_price,
                        quantity=qty,
                        subtotal=total,
                    )
                    db.add(order_item)
                    if status == "paid":
                        selected_var.sold_quantity += qty
                    elif status == "pending":
                        selected_var.reserved_quantity += qty
                    db.commit()

                    if status == "paid":
                        payment = Payment(
                            order_id=order.id,
                            provider="vietqr",
                            amount=total,
                            currency="VND",
                            status="completed",
                            paid_at=order.paid_at,
                            created_at=created_date,
                        )
                        db.add(payment)
                        db.commit()

                print("[OK] Seeded 35 fashion historical orders with variant metadata!")

        print("[SUCCESS] All TrueLook fashion database seeding completed successfully!")

    except Exception as e:
        print(f"[ERROR] Database seeding failed: {e}")
        db.rollback()
        raise e
    finally:
        if should_close:
            db.close()


if __name__ == "__main__":
    force_run = "--force" in sys.argv
    seed_database(force=force_run)
