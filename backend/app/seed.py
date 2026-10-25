import os
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from sqlalchemy import or_

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.core.slug import slugify
from app.features.categories.model import Category
from app.features.orders.model import Order, OrderItem, Payment
from app.features.products.model import Product, ProductImage
from app.features.products.variant_model import ProductVariant
from app.features.users.model import User
from app.integrations.storage import MinioProductStorage


def seed_database(db=None, force: bool = False):
    settings = get_settings()
    app_env = settings.app_env.strip().lower()
    if app_env == "production":
        raise RuntimeError(
            "Refusing demo seed in production; use python -m app.cli create-admin"
        )

    print(f"[SEED] Starting TrueLook fashion database seeding (env: {app_env})...")
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        storage = MinioProductStorage(settings)
        storage.ensure_bucket()

        # 1. Seed Admin User
        admin_user = (
            db.query(User)
            .filter(or_(User.email == "admin@example.com", User.username == "admin"))
            .first()
        )

        if not admin_user:
            admin_pwd = settings.seed_admin_password or secrets.token_urlsafe(24)
            admin_user = User(
                first_name="System",
                last_name="Admin",
                username="admin",
                email="admin@example.com",
                password_hash=hash_password(admin_pwd),
                role="admin",
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            print(f"[OK] Created Admin User: admin@example.com / {admin_pwd}")

        # 2. Seed Customer User
        customer = (
            db.query(User)
            .filter(or_(User.email == "user@example.com", User.username == "demouser"))
            .first()
        )

        if not customer:
            cust_pwd = settings.seed_customer_password or secrets.token_urlsafe(24)
            customer = User(
                first_name="Demo",
                last_name="Customer",
                username="demouser",
                email="user@example.com",
                password_hash=hash_password(cust_pwd),
                role="customer",
            )
            db.add(customer)
            db.commit()
            db.refresh(customer)
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

        # Retire previously seeded shoes/accessories without deleting order history.
        retired_slugs = [
            "giay",
            "giay-sneaker",
            "giay-cao-got",
            "giay-loafer",
            "phu-kien",
            "tui-xach",
            "that-lung",
            "kinh-mat",
        ]
        for category in db.query(Category).filter(Category.slug.in_(retired_slugs)):
            category.is_deleted = True
            for product in db.query(Product).filter_by(category_id=category.id):
                product.is_active = False
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

        # 5. Seed 12 Curated Fashion Products with Variants and Size Charts
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
                "image_asset": "ao-thun-cotton-compact-basic.svg",
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
                "image_asset": "ao-so-mi-oxford-dai-tay.svg",
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
                "image_asset": "ao-polo-pique-thoang-khi.svg",
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
                "image_asset": "quan-jeans-slim-fit-co-gian.svg",
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
                "image_asset": "quan-tay-xep-ly-cao-cap.svg",
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
                "image_asset": "quan-short-kaki-chino.svg",
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
                "image_asset": "dam-xoe-hoa-nhi-vintage.svg",
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
                "image_asset": "chan-vay-xep-ly-chu-a.svg",
                "variants": [
                    ("S", "Đen", "#000000", 25),
                    ("M", "Đen", "#000000", 30),
                    ("L", "Đen", "#000000", 15),
                    ("S", "Nâu Tây", "#8B4513", 20),
                    ("M", "Nâu Tây", "#8B4513", 20),
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
                "image_asset": "ao-blazer-linen-2-hang-khuy.svg",
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
                "image_asset": "ao-hoodie-ni-bong-phom-rong.svg",
                "variants": [
                    ("M", "Xám Ghi", "#9E9E9E", 25),
                    ("L", "Xám Ghi", "#9E9E9E", 30),
                    ("XL", "Xám Ghi", "#9E9E9E", 20),
                    ("M", "Đen", "#1C1C1C", 30),
                    ("L", "Đen", "#1C1C1C", 25),
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
                "image_asset": "dam-da-hoi-lua-satin-co-v.svg",
                "variants": [
                    ("S", "Đỏ Rượu", "#800020", 12),
                    ("M", "Đỏ Rượu", "#800020", 15),
                    ("S", "Đen Tuyền", "#0B0B0B", 14),
                    ("M", "Đen Tuyền", "#0B0B0B", 18),
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
                "image_asset": "ao-khoac-bomber-kaki-lot-du.svg",
                "variants": [
                    ("M", "Xanh Rêu", "#3D5229", 20),
                    ("L", "Xanh Rêu", "#3D5229", 25),
                    ("XL", "Xanh Rêu", "#3D5229", 15),
                    ("M", "Đen", "#000000", 25),
                    ("L", "Đen", "#000000", 20),
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

            # Upload bundled assets on every run so storage can be restored independently.
            object_name = f"products/demo/{pdata['image_asset']}"
            asset = Path(__file__).parent / "seed_assets" / pdata["image_asset"]
            with asset.open("rb") as stream:
                storage.put(object_name, stream, "image/svg+xml")

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
                    object_name=object_name,
                    kind="flat_lay",
                    is_primary=True,
                    sort_order=0,
                )
                db.add(img)
                db.commit()

            elif img.object_name.startswith(
                ("https://images.unsplash.com/", "products/demo/")
            ):
                img.object_name = object_name
                img.kind = "flat_lay"
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

        # Three deterministic examples; repeated seeding preserves orders and stock.
        now = datetime.now(timezone.utc)
        scenarios = [("confirmed", "cod"), ("delivered", "cod"), ("paid", "vietqr")]
        for i, (status, method) in enumerate(scenarios):
            code = f"truelook-demo-order-{i + 1}"
            if db.query(Order).filter_by(public_code=code).first():
                continue
            prod = created_products[i]
            variant = (
                db.query(ProductVariant)
                .filter_by(product_id=prod.id, is_active=True)
                .order_by(ProductVariant.id)
                .first()
            )
            total = variant.price
            created = now - timedelta(days=2 - i)
            paid = status in {"delivered", "paid"}
            order = Order(
                public_code=code,
                user_id=customer.id,
                product_id=prod.id,
                product_name=prod.name,
                unit_price=total,
                quantity=1,
                total_amount=total,
                currency="VND",
                status=status,
                customer_name=customer.full_name,
                customer_phone="0912345678",
                shipping_address="72 Le Thanh Ton, Quan 1, TP Ho Chi Minh",
                notes="Demo sample order",
                payment_method=method,
                created_at=created,
                paid_at=created if paid else None,
            )
            db.add(order)
            db.flush()
            db.add(
                OrderItem(
                    order_id=order.id,
                    product_id=prod.id,
                    variant_id=variant.id,
                    sku=variant.sku,
                    size=variant.size,
                    color_name=variant.color_name,
                    product_name=prod.name,
                    unit_price=total,
                    quantity=1,
                    subtotal=total,
                )
            )
            if paid:
                variant.sold_quantity += 1
                db.add(
                    Payment(
                        order_id=order.id,
                        provider=method,
                        amount=total,
                        currency="VND",
                        status="paid",
                        paid_at=created,
                        created_at=created,
                    )
                )
            else:
                variant.reserved_quantity += 1
            db.commit()
        print("[OK] Demo orders ready: COD confirmed, COD delivered, VietQR paid.")

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
