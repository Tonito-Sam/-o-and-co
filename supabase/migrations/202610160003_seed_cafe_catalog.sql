with catalog (
  branch_slug, name, category, description, price_zar, image_url
) as (
  values
    ('kyalami', 'Americano', 'Coffee', 'Espresso topped with hot water.', 35, '/cafe/products/americano.jpg'),
    ('kyalami', 'Caffe Latte', 'Coffee', 'Espresso with steamed milk.', 35, '/cafe/products/caffe-latte.jpg'),
    ('kyalami', 'Cappuccino', 'Coffee', 'Espresso with steamed milk and foam.', 35, '/cafe/products/cappuccino.jpg'),
    ('kyalami', 'Decaf', 'Coffee', 'Decaffeinated coffee.', 35, '/cafe/products/espresso.jpg'),
    ('kyalami', 'Espresso Double', 'Coffee', 'Double espresso.', 30, '/cafe/products/espresso.jpg'),
    ('kyalami', 'Hot Chocolate', 'Coffee', 'Hot chocolate.', 35, '/cafe/products/hot-chocolate.jpg'),
    ('kyalami', 'Cheese Grillers & Eggs', 'Breakfast', 'Grilled cheese grillers, two sauteed eggs, vine-roasted tomato, and warm Portuguese bread.', 70, '/cafe/products/cheese-grillers-eggs.jpg'),
    ('kyalami', 'Bacon & Vegetable Skewer', 'Breakfast', 'Char-grilled bacon and seasonal vegetable skewer with eggs and toasted focaccia.', 60, '/cafe/products/bacon-vegetable-skewer.jpg'),
    ('kyalami', 'Braai Pork Ribs', 'Lunch', 'Pork ribs basted in BBQ glaze with a seasonal side salad.', 90, '/cafe/products/braai-pork-ribs.jpg'),
    ('kyalami', 'Flame-Grilled Beef Prego', 'Lunch', 'BBQ-marinated beef served in a Portuguese or focaccia roll.', 70, '/cafe/products/beef-prego.jpg'),
    ('kyalami', 'Grilled Chicken Leg Quarter', 'Lunch', 'Herb-marinated flame-grilled chicken with a seasonal side salad.', 60, '/cafe/products/grilled-chicken-leg-quarter.jpg'),
    ('kyalami', 'Flame-Grilled Short Rib Skewer', 'Lunch', 'Beef short rib skewer served with warm focaccia or side salad.', 85, '/cafe/products/short-rib-skewer.jpg'),
    ('kyalami', '100% Beef Boerewors Roll', 'Lunch', 'Beef boerewors served in a brioche bun.', 50, '/cafe/products/boerewors-roll.jpg'),
    ('kyalami', 'Chicken Kebabs', 'Lunch', 'Marinated chicken pieces with onion and peppers, flame-grilled and served with salad.', 75, '/cafe/products/chicken-kebabs.jpg'),
    ('rosebank', 'Breakfast Wrap', 'Breakfast', 'Toasted wrap with scrambled egg, bacon, avo, and Perinaise sauce.', 85, '/cafe/products/breakfast-wrap.jpg'),
    ('rosebank', 'Classic Breakfast', 'Breakfast', 'Grilled sausage, bacon, mushrooms, tomato, and toast.', 110, '/cafe/products/classic-breakfast.jpg'),
    ('rosebank', 'Frittata', 'Breakfast', 'Open omelette with bacon, mushrooms, peppers, and cheese.', 95, '/cafe/products/frittata.jpg'),
    ('rosebank', 'Stuffed Croissant', 'Breakfast', 'Scrambled egg, cream cheese, and capers.', 75, '/cafe/products/croissant.jpg'),
    ('rosebank', 'Chicken Burger', 'Lunch', 'Chicken fillet with sweet chilli slaw in a toasted sesame brioche bun.', 90, '/cafe/products/chicken-burger.jpg'),
    ('rosebank', 'Beef Burger', 'Lunch', 'Beef barbecue patty with Perinaise sauce in a toasted brioche bun.', 105, '/cafe/products/beef-burger.jpg'),
    ('rosebank', 'Beef Steak', 'Lunch', 'Flame-grilled 200 g sirloin steak.', 120, '/cafe/products/beef-steak.jpg'),
    ('rosebank', 'Boerewors Roll', 'Lunch', 'Flame-grilled boerewors in a brioche bun.', 105, '/cafe/products/boerewors-roll.jpg'),
    ('rosebank', 'Beef Prego', 'Lunch', 'Flame-grilled marinated beef prego in a focaccia roll.', 95, '/cafe/products/beef-prego.jpg'),
    ('rosebank', 'Chicken Mayo Wrap', 'Lunch', 'Grilled chicken strips, lettuce, and slaw.', 75, '/cafe/products/chicken-mayo-wrap.jpg'),
    ('rosebank', 'Sweet Chilli Wrap', 'Lunch', 'Grilled chicken strips, sweet chilli sauce, and slaw.', 75, '/cafe/products/chicken-mayo-wrap.jpg'),
    ('rosebank', 'Garden Salad', 'Lunch', 'Fresh garden salad.', 35, '/cafe/products/garden-salad.jpg'),
    ('rosebank', 'Small Chips Bowl', 'Snacks', 'Small bowl of chips.', 25, '/cafe/products/chips.jpg'),
    ('rosebank', 'Large Chips Bowl', 'Snacks', 'Large bowl of chips.', 45, '/cafe/products/chips.jpg'),
    ('rosebank', 'Corn Salad (Veg)', 'Lunch', 'Vegetarian corn salad.', 70, '/cafe/products/corn-salad.jpg'),
    ('rosebank', 'Bacon, Egg & Cheese Toasted Sandwich', 'Breakfast', 'Bacon, egg, and cheese toasted sandwich.', 65, '/cafe/products/toasted-sandwich.jpg'),
    ('rosebank', 'Chicken Mayo Toasted Sandwich', 'Lunch', 'Chicken mayo toasted sandwich.', 65, '/cafe/products/chicken-mayo-sandwich.jpg'),
    ('rosebank', 'Cheese & Tomato Toasted Sandwich', 'Lunch', 'Cheese and tomato toasted sandwich.', 55, '/cafe/products/toasted-sandwich.jpg'),
    ('rosebank', 'Cheese Toasted Sandwich', 'Lunch', 'Cheese toasted sandwich.', 45, '/cafe/products/toasted-sandwich.jpg'),
    ('rosebank', 'Slice of Carrot Cake', 'Bakery', 'Slice of carrot cake.', 55, '/cafe/products/carrot-cake.jpg'),
    ('rosebank', 'Cafe Muffin', 'Bakery', 'Freshly baked cafe muffin.', 23, '/cafe/products/muffin.jpg'),
    ('rosebank', 'Croissant', 'Bakery', 'Freshly baked croissant.', 25, '/cafe/products/croissant.jpg'),
    ('rosebank', 'Large Cappuccino', 'Coffee', 'Large cappuccino.', 37, '/cafe/products/large-cappuccino.jpg'),
    ('rosebank', 'Small Cappuccino', 'Coffee', 'Small cappuccino.', 29, '/cafe/products/small-cappuccino.jpg'),
    ('rosebank', 'Tea', 'Tea', 'Tea.', 20, '/cafe/products/tea.jpg'),
    ('rosebank', 'Americano', 'Coffee', 'Americano coffee.', 25, '/cafe/products/americano.jpg'),
    ('rosebank', 'Soft Drinks', 'Cold Drinks', 'Assorted soft drinks.', 15, '/cafe/products/soft-drink.jpg'),
    ('rosebank', 'Energade', 'Cold Drinks', 'Energade sports drink.', 18, '/cafe/products/energade.jpg'),
    ('rosebank', 'Powerade', 'Cold Drinks', 'Powerade sports drink.', 20, '/cafe/products/powerade.jpg'),
    ('rosebank', 'Lays', 'Snacks', 'Packet of Lays chips.', 12, '/cafe/products/chips.jpg'),
    ('rosebank', 'Doritos', 'Snacks', 'Packet of Doritos.', 12, '/cafe/products/doritos.jpg'),
    ('rosebank', 'Peanuts', 'Snacks', 'Packet of peanuts.', 15, '/cafe/products/peanuts.jpg')
)
insert into public.cafe_products (
  branch_id, name, category, description, price_zar, image_url,
  vendor, is_available, is_popular, is_active, track_inventory,
  stock_quantity, low_stock_threshold
)
select
  b.id, catalog.name, catalog.category, catalog.description, catalog.price_zar, catalog.image_url,
  'Office & Co Café', true, false, true, false, 0, 5
from catalog
join public.branches b on b.slug = catalog.branch_slug
on conflict (branch_id, name) do update set
  category = excluded.category,
  description = excluded.description,
  price_zar = excluded.price_zar,
  image_url = excluded.image_url,
  vendor = excluded.vendor,
  is_available = excluded.is_available,
  is_active = excluded.is_active,
  track_inventory = excluded.track_inventory,
  low_stock_threshold = excluded.low_stock_threshold;