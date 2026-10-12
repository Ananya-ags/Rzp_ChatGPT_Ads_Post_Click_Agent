/**
 * Hand-written past shopper questions (~150). Theme labels live only in the answer key
 * (evals/planted_facts.json) so the clustering pipeline has to find the themes itself.
 * [text, hinglish, unmet, preferred ad group]
 */
type M = [string, boolean, boolean, "w" | "wed" | "off"];

export const THEMES: Record<string, M[]> = {
  hypoallergenic: [
    ["do you have anything for sensitive ears?", false, true, "w"],
    ["are these nickel-free?", false, true, "w"],
    ["my ears itch with fake gold, will these be ok", false, true, "w"],
    ["kaan mein allergy hoti hai, ye safe hai?", true, true, "off"],
    ["hypoallergenic studs?", false, true, "off"],
    ["I'm allergic to nickel, which earrings can I wear", false, true, "w"],
    ["something for sensitive skin pls", false, true, "wed"],
    ["will my ears get red with these", false, true, "w"],
    ["nickel free hoops?", false, true, "w"],
    ["my daughter has sensitive ears, any studs for her?", false, true, "wed"],
    ["do these cause allergy", false, true, "off"],
    ["skin safe earrings for everyday?", false, true, "w"],
    ["mere kaan sensitive hain, koi studs batao", true, true, "off"],
    ["can people with metal allergy wear this", false, true, "w"],
    ["hypoallergenic options under 2000?", false, true, "off"],
    ["I react to most earrings, help", false, true, "w"],
    ["earrings that won't irritate piercings", false, true, "w"],
    ["new piercing, which studs are safe", false, true, "off"],
    ["does the gold plating have nickel underneath", false, true, "w"],
    ["nickel allergy friendly gift for my mom", false, true, "wed"],
    ["ears swell with cheap earrings, are yours different", false, true, "w"],
    ["itchy ears ka koi solution? nickel free hai kya", true, true, "w"],
    ["safe for sensitive earlobes?", false, true, "off"],
    ["any certified hypoallergenic earrings", false, true, "wed"],
    ["is stainless steel ok for allergies", false, true, "w"],
    ["studs that don't make my ears itch", false, true, "off"],
    ["sensitive ears wale ke liye kya acha hai", true, true, "wed"],
    ["which of these is best for allergic ears", false, true, "wed"],
  ],
  waterproof: [
    ["can I shower with it", false, false, "w"], ["pool safe?", false, false, "w"], ["will it tarnish if I swim", false, false, "w"],
    ["can I wear it to the gym", false, false, "w"], ["is it waterproof", false, false, "w"], ["sweat se kaala toh nahi hoga?", true, false, "w"],
    ["beach trip next week, can I wear these in the sea", false, false, "w"], ["will the gold come off in water", false, false, "w"],
    ["do I need to remove before bath", false, false, "w"], ["shower mein pehen sakte hain?", true, false, "w"], ["is the gold coating durable", false, false, "w"],
    ["can I sleep and shower in the huggies", false, false, "off"], ["how long does the gold last", false, false, "w"], ["does perfume damage it", false, false, "wed"],
    ["I wash my hands 20 times a day, ok?", false, false, "off"], ["water resistant or waterproof?", false, false, "w"], ["can I wear the chain while swimming", false, false, "w"],
    ["will chlorine affect it", false, false, "w"], ["safe for hot yoga?", false, false, "w"], ["rain mein kharab hoga kya", true, false, "w"],
    ["does it turn green", false, false, "off"], ["my last earrings faded in a month, will these?", false, false, "w"], ["can my kid wear them in the pool", false, false, "w"],
    ["sea water ok?", false, false, "w"], ["is the paperclip chain waterproof too", false, true, "w"], ["steam room ok?", false, true, "w"],
    ["wear 24/7?", false, false, "off"], ["tarnish warranty?", false, false, "w"], ["dishwashing with the ring on ok?", false, true, "w"], ["does sunscreen affect the coating", false, false, "w"],
  ],
  delivery: [
    ["will it reach before Diwali", false, false, "wed"], ["need by Friday", false, false, "w"], ["delivery to Pune by 18th?", false, false, "w"],
    ["how many days to Bangalore", false, false, "off"], ["can it come by Saturday, it's a gift", false, false, "wed"], ["kab tak aayega Delhi mein", true, false, "wed"],
    ["express shipping?", false, true, "w"], ["need it before my sister's sangeet on 20th", false, false, "wed"], ["do you deliver to 845401", false, false, "w"],
    ["same day delivery in Mumbai?", false, true, "off"], ["when will the 3cm hoops ship", false, false, "off"], ["why does this one take longer", false, false, "off"],
    ["is COD available for my pincode", false, false, "w"], ["order today, reach by Thursday?", false, false, "w"], ["track my order", false, true, "w"],
    ["ships from where?", false, false, "off"], ["can I get it in 2 days", false, true, "w"], ["Diwali se pehle mil jayega?", true, false, "wed"],
    ["need it by 16th for an interview", false, false, "off"], ["how long for Jaipur", false, false, "wed"], ["do you ship outside India", false, true, "wed"],
    ["weekend delivery?", false, false, "w"], ["will it reach in time for karva chauth", false, false, "wed"], ["delivery charges for 1 item?", false, false, "off"],
    ["agar aaj order karu toh kab milega", true, false, "w"],
  ],
  size_fit: [
    ["how big is it", false, false, "w"], ["too heavy?", false, false, "wed"], ["4cm vs 3cm which is better for office", false, false, "w"],
    ["will 4cm look too big on a small face", false, false, "w"], ["how far does it hang", false, false, "w"], ["what's the inner diameter", false, false, "off"],
    ["size compare with a coin?", false, false, "w"], ["is 2cm too small", false, false, "off"], ["chain length for a high neck kurta", false, false, "off"],
    ["ring size chart?", false, false, "off"], ["adjustable ring fits size 9?", false, false, "w"], ["bahut bade toh nahi lagenge?", true, false, "w"],
    ["weight of each earring", false, false, "wed"], ["will the huggie fit a second piercing", false, false, "off"], ["the layered set, how long is the longest chain", false, false, "off"],
    ["cuff fits a small wrist?", false, false, "wed"], ["kitna lamba hai jhumka", true, false, "wed"], ["do they look bigger in person", false, false, "w"],
    ["for a petite person which hoop", false, false, "w"], ["thickness of the hoop?", false, false, "w"],
  ],
  gifting: [
    ["gift wrap?", false, false, "wed"], ["gift for my sister's wedding", false, false, "wed"], ["can I add a note", false, false, "wed"],
    ["gift under 2000 for a colleague", false, false, "off"], ["will the price show on the invoice", false, false, "wed"], ["anniversary gift idea", false, false, "wed"],
    ["gift for mom who likes simple gold", false, false, "wed"], ["can it be delivered to a different address", false, false, "wed"], ["best seller for gifting?", false, false, "wed"],
    ["exchange if she doesn't like it?", false, false, "wed"], ["bhabhi ke liye gift chahiye", true, false, "wed"], ["gift box included?", false, false, "wed"],
    ["something for a bridesmaid set of 4", false, true, "wed"], ["bhai ki shaadi hai, matching set milega kya", true, true, "wed"], ["matching earrings and necklace for a gift", false, false, "wed"],
  ],
  returns_trust: [
    ["can I return if it tarnishes", false, false, "w"], ["return policy?", false, false, "w"], ["what if it breaks", false, false, "w"],
    ["is this real gold", false, false, "wed"], ["warranty claim process", false, false, "w"], ["refund kitne din mein aata hai", true, false, "w"],
    ["are you a genuine brand", false, false, "wed"], ["can I exchange size", false, false, "off"], ["who pays return shipping", false, false, "w"], ["is payment secure", false, false, "wed"],
  ],
  other: [
    ["do you have a store in Pune", false, true, "w"], ["men's earrings?", false, true, "w"], ["what's the weather", false, true, "w"],
    ["can you write my email", false, true, "off"], ["do you have silver tone", false, true, "off"], ["are you a bot", false, false, "w"],
    ["how to clean", false, false, "off"], ["nose pins?", false, true, "wed"], ["anklets?", false, true, "wed"],
    ["bulk order for a corporate event", false, true, "off"], ["do you sell gift cards", false, true, "wed"], ["student discount?", false, true, "w"],
    ["give me 50% off", false, true, "w"], ["tell me a joke", false, true, "w"], ["koi offer hai kya", true, false, "w"], ["can I talk to a human", false, false, "off"],
  ],
};

export const AG = { w: "waterproof-everyday-under-5k", wed: "wedding-guest-gift", off: "office-minimal" } as const;
