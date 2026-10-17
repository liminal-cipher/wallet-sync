// Reviewed names, not an inventory of issued vouchers or a live price feed.
const checkedOn = "2026-10-17";
const brand = (id, name, aliases, category, url, products, extra = {}) => ({
  id, name, aliases, category, state: "active", defaultBenefitType: category === "retail" ? "monetary" : "product",
  source: { url, checkedOn }, iconId: id,
  products: products.map(([productId, productName, productAliases = [], variants = []]) => ({
    id: productId, name: productName, aliases: productAliases, state: "active",
    variants: variants.map(([variantId, variantName]) => ({ id: variantId, name: variantName })),
  })), ...extra,
});
const brands = [
  brand("starbucks", "스타벅스", ["스벅", "Starbucks"], "cafe", "https://www.starbucks.co.kr/msr/msreward/level_benefit.do", [
    ["americano", "카페 아메리카노", ["아메리카노"], [["tall", "Tall"]]],
    ["iced-americano", "아이스 카페 아메리카노", ["아아"], [["tall", "Tall"]]],
    ["latte", "카페 라떼", ["카페라떼"], [["tall", "Tall"]]],
    ["iced-latte", "아이스 카페 라떼", [], [["tall", "Tall"]]],
  ]),
  brand("compose", "컴포즈커피", ["컴포즈", "컴포즈 커피", "Compose Coffee"], "cafe", "https://composecoffee.com/", [], { sourceStatus: "brand-only" }),
  brand("mega", "메가MGC커피", ["메가", "메가커피", "메가 커피", "Mega MGC Coffee"], "cafe", "https://www.mega-mgccoffee.com/menu/menu.php?category=1&menu_category1=1&menu_category2=1&page=1", [
    ["americano", "아메리카노"], ["mega-americano", "메가리카노"], ["espresso", "에스프레소"], ["vanilla-latte", "바닐라라떼"],
  ]),
  brand("daiso", "다이소", ["Daiso"], "retail", "https://www.daiso.co.kr/", []),
  brand("oliveyoung", "올리브영", ["올영", "Olive Young", "Oliveyoung"], "retail", "https://www.oliveyoung.co.kr/store/giftCardGuide/getGiftCardGuide.do", [], { iconId: null }),
  brand("paul-bassett", "폴 바셋", ["폴바셋", "Paul Bassett"], "cafe", "https://www.baristapaulbassett.co.kr/menu/List.pb?cid1=A", [
    ["lungo", "룽고", ["Lungo"]], ["iced-lungo", "아이스 룽고", ["Iced Lungo"]],
    ["latte", "카페라떼", ["카페 라떼"]], ["iced-latte", "아이스 카페라떼", [], [["standard", "Standard"], ["grand", "Grand"]]],
    ["espresso", "에스프레소"], ["decaf-americano", "디카페인 아메리카노"],
  ]),
  brand("hollys", "할리스", ["할리스커피", "할리스 커피", "Hollys"], "cafe", "https://www.hollys.co.kr/menu/espresso.do", [
    ["vanilla-delight", "바닐라 딜라이트"], ["cappuccino", "카푸치노"], ["cold-brew", "콜드브루", ["콜드 브루"]],
    ["dolce-latte", "돌체 라떼"], ["caramel-macchiato", "카라멜 마키아또"],
    ["americano", "아메리카노", ["Caffe Americano"]], ["latte", "카페 라떼", ["카페라떼", "Caffe Latte"]],
    ["mocha", "카페 모카", ["카페모카", "Caffe Mocha"]], ["espresso", "에스프레소", ["Espresso"]],
  ], { source: { url: "https://www.hollys.co.kr/menu/espresso.do", checkedOn: "2026-10-18" } }),
  brand("mammoth-coffee", "매머드커피", ["매머드", "매머드 커피", "Mammoth Coffee"], "cafe", "https://www.mmthcoffee.com/sub/menu/list_coffee.php", [
    ["mammoth-coffee", "매머드 커피"], ["snow-mammoth", "스노우 매머드 커피"], ["americano", "아메리카노"],
    ["latte", "카페 라떼"], ["signature-latte", "시그니처 라떼"],
  ], { iconId: "mammoth", family: "mammoth", segmentId: "coffee", segmentName: "매머드커피" }),
  brand("mammoth-express", "매머드 익스프레스", ["매머드", "매머드커피", "매머드익스프레스", "Mammoth Express"], "cafe", "https://www.mmthcoffee.com/sub/menu/list.html", [
    ["americano", "아메리카노"], ["latte", "카페 라떼"], ["signature-latte", "시그니처 라떼"],
    ["honey-coffee", "꿀 커피"], ["vanilla-latte", "바닐라 라떼"],
  ], { iconId: "mammoth", family: "mammoth", segmentId: "express", segmentName: "매머드 익스프레스" }),
  brand("ediya", "이디야커피", ["이디야", "이디야 커피", "Ediya Coffee"], "cafe", "https://www.ediya.com/contents/drink.html", [
    ["americano", "카페 아메리카노", ["아메리카노"]],
  ]),
  brand("paik", "빽다방", ["빽 다방", "Paik's Coffee", "Paikdabang"], "cafe", "https://paikdabang.com/menu/menu_coffee/", [
    ["original-iced", "원조커피(ICED)", ["원조커피", "아이스 원조커피"]], ["original-hot", "원조커피(HOT)", ["원조커피"]],
    ["iced-tea-shot", "아이스티샷추가(아샷추)", ["아샷추"]], ["decaf-americano-iced", "디카페인 아메리카노(ICED)"],
  ]),
  brand("coffeebean", "커피빈", ["커피 빈", "Coffee Bean", "The Coffee Bean & Tea Leaf"], "cafe", "https://www.coffeebeankorea.com/menu/list.asp?category=13", [
    ["coffeebeancano", "커피빈카노", ["아메리카노"]], ["iced-coffeebeancano", "아이스 커피빈카노"],
    ["latte", "커피빈라떼"], ["iced-latte", "아이스 커피빈라떼"],
  ], { iconId: null }),
  brand("gongcha", "공차", ["Gong Cha", "Gongcha"], "cafe", "https://www.gong-cha.co.kr/brand", [
    ["low-sugar-black-milk-tea", "저당 블랙 밀크티"], ["low-sugar-earl-grey-milk-tea", "저당 얼그레이 밀크티"],
    ["brown-sugar-oolong-pearl", "브라운슈가 시그니처 우롱 밀크티 + 펄"],
  ]),
  brand("baskin-robbins", "배스킨라빈스", ["배라", "베스킨라빈스", "Baskin Robbins", "BR31"], "dessert", "https://www.baskinrobbins.co.kr/menu/list.php?category=A", [
    ["puss-in-boots", "엄마는 외계인"], ["mint-chocolate-chip", "민트 초콜릿 칩", ["민트초코", "민초"]],
    ["almond-bonbon", "아몬드 봉봉"], ["new-york-cheesecake", "뉴욕 치즈케이크"],
  ]),
  brand("paris-baguette", "파리바게뜨", ["파리바게트", "파바", "Paris Baguette"], "bakery", "https://www.paris.co.kr/products/", [
    ["pave-chocolate-cake", "파베 초콜릿 케이크"], ["basque-cheesecake", "바스크 치즈 케익"], ["cookie-cheese-cake", "쿠키 앤 치즈 케이크"],
  ]),
  brand("tous-les-jours", "뚜레쥬르", ["뚜레주르", "Tous Les Jours", "TLJ"], "bakery", "https://www.tlj.co.kr/index.asp", [
    ["strawberry-queen", "스트로베리 퀸"], ["shine-queen", "샤인 퀸"], ["cream-mocha-bun", "크림 가득 모카번"],
  ]),
  brand("dunkin", "던킨", ["던킨도너츠", "던킨 도너츠", "Dunkin"], "bakery", "https://www.dunkindonuts.co.kr/menu?cat=1&sub=37", [
    ["famous-glazed", "페이머스 글레이즈드"], ["cacao-honeydip", "카카오하니딥"], ["olive-chewisty", "올리브 츄이스티"],
    ["strawberry-filled", "스트로베리 필드"], ["bavarian-filled", "바바리안필드"], ["boston-cream", "보스톤 크림"],
  ]),
];
module.exports = { schemaVersion: 1, version: "2026-10-18.1", brands };
