# Cosmos knowledge base: ground truth for the agent (draft v1, 12 Oct 2026)

This is the single source of truth the agent may quote for anything that isn't a product fact. After review, it becomes `data/policies.json`: one entry per section, with `id`, `title`, `text`, `facts` (machine-readable numbers), `applies_to`, `version` and `last_updated`. The agent reaches it only through `lookup_policy(topic)`.

- Cosmos is a **fictional brand**; every policy here is invented for the prototype.
- Numbers match `brand.json`, `offers.json`, `razorpay.json` and the catalogue.
- All assumptions were confirmed on 13 Oct 2026.
- **Units (13 Oct 2026):** every size is in **cm** (e.g. "Diameter: 3cm", "Length: 4.8cm", ring inner diameters such as 1.73cm).
- **Materials revised 13 Oct 2026:**
  - Every earring is **one metal throughout**; nothing is made of a second metal, including the part that goes through the piercing (the titanium and surgical-steel parts are gone).
  - "PVD" and "316L" are no longer used anywhere; steel pieces are "stainless steel" with "18K gold plating".
  - The sensitive-ears demand now leads to an ad for the **stainless steel earrings**. It states the metal only, never "hypoallergenic" or "nickel-free".

---

## How the agent uses this file

1. **Facts:** quote only what a section says. If no section or tool result covers a genuine product or policy question, don't guess. Reply with the care line from `support.contact`: "I don't have that information right now. Please write to our care team at care@cosmosjewels.example and we'll get back to you within 24 hours." Off-topic or abusive messages get a polite decline instead, never the care line.
2. **Citations:** every policy answer cites the section ID in the trace. The console shows "Policy cited: returns.window v1".
3. **Overrides:** product facts (from tools) win over general policy for that product. Example: Lia studs carry no warranty, even though most pieces do.
4. **Regulated words** (hypoallergenic, nickel-free, waterproof, real gold, hallmark, certified, any medical claim): use them only as the claims ladder in `materials.claims_ladder` allows.

---

## Company and product basics

### `company.about`
Cosmos is an online-only Indian jewellery brand making modern, anti-tarnish demi-fine pieces for everyday wear. Orders ship from our studio in Jaipur. We don't have physical stores yet.

### `product.authenticity`
- **Plated, not solid gold:** Cosmos pieces are gold plated or gold vermeil. They are not solid gold, so they aren't hallmarked.
- **Gold vermeil:** a thick layer of gold over sterling silver.
- **No resale value:** our pieces aren't sold by weight of gold and don't carry gold resale value.
- **What the agent says if asked "is it real gold?":** "It's 18K gold plating over [base metal], not solid gold."

### `product.demi_fine`
"Demi-fine" means a durable base metal (stainless steel, sterling silver or brass) with a gold finish. Pieces are made to be worn daily, priced well below fine jewellery.

### `product.stones`
- **Sparkle:** our sparkling stones are cubic zirconia (American diamond).
- **Pearls:** shell pearls or freshwater-style pearls, as stated on each product.
- **Not precious:** none are diamonds or precious gemstones, and none come with a certificate.

---

## Materials, skin and water

### `materials.overview`
| Material (as on the product page) | What it is | Notes |
|---|---|---|
| **Stainless steel + 18K gold plating** | Stainless steel with an 18K gold finish | Most durable finish; 12-month anti-tarnish warranty |
| **Brass + 18K gold plating** | Brass base with gold electroplating | Keep dry; 6-month anti-tarnish warranty |
| **Sterling silver + gold vermeil** | 925 silver with a thick gold layer | Keep dry; silver can darken if exposed to moisture; 6-month warranty |
| **Gold-toned** | Brass with a gold-coloured finish (plating details not specified) | No anti-tarnish warranty |

**One metal throughout:** every earring is made entirely of its listed metal, including the part that goes through the piercing.

### `materials.skin_sensitivity`
- **Consistency on sensitive skin:** we can't promise that any piece suits every skin. Reactions depend on the person.
- **Stainless steel:** each steel earring is stainless steel all the way through. Many people who react to plated brass do fine with steel, but steel contains some nickel. So we never call it nickel-free or hypoallergenic, and every steel piece carries `nickel_free: false`.
- **Brass and gold-toned pieces:** not recommended for people who react to metals.
- **If you've had a reaction before:** talk to a dermatologist before buying. Stop wearing a piece if your skin gets irritated.
- **Medical questions:** the agent never gives medical advice and hands off to the care team.

### `materials.claims_ladder` (how the agent may talk about materials)
| Level | When allowed | Example wording |
|---|---|---|
| 0. Don't mention | The shopper didn't ask, and it doesn't matter | — |
| 1. Describe the material | Always, from verified fields or the product description | "These are stainless steel all the way through, with 18K gold plating." |
| 2. State a verified attribute | Only when the field is verified (`water_resistant: true`; `nickel_free: true` if the brand ever verifies it, and no current piece is) | "These are verified water-resistant." |
| 3. Medical or guarantee claims | **Never** | ✗ "hypoallergenic", "safe for all skin", "won't cause allergies", "cures" |

### `materials.water_and_wear`
- **Verified water-resistant pieces** (gold-plated stainless steel, marked on the product page):
  - fine in the shower, pool and sea, and at the gym
  - fine to sleep in
  - rinse after salt water or chlorine and pat dry
- **Everything else** (brass, silver, gold-toned):
  - keep dry; take off before showering, swimming or working out
  - put perfume, lotion and hairspray on first, then the jewellery
- **Nothing is "waterproof forever".** Harsh chemicals (cleaning products, bleach) can damage any finish.

### `materials.vague_claims`
If a product description uses vague wording ("water friendly", "skin-safe for most", "gold-toned"), the agent treats it as unverified. It doesn't repeat it as a claim, and it suggests keeping the piece dry.

---

## Care

### `care.steel`
Rinse with water, pat dry with a soft cloth, done. Avoid abrasive cleaners. Store pieces separately to avoid scratches.

### `care.brass_silver`
- Keep dry, and wipe with a soft cloth after wearing.
- Store in the Cosmos pouch, away from humidity.
- Skip perfume on the metal.
- No dips or jewellery cleaners on plated pieces.

### `care.stones_pearls`
Wipe pearls with a soft dry cloth. Don't soak pieces with stones or pearls. Put them on last and take them off first.

---

## Warranty

### `warranty.anti_tarnish`
| Pieces | Anti-tarnish warranty |
|---|---|
| Stainless steel + 18K gold plating | **12 months** from delivery |
| Brass + 18K gold plating; sterling silver + gold vermeil | **6 months** from delivery |
| Gold-toned pieces (e.g. Lia studs, CZ solitaire ring) | No anti-tarnish warranty |

**Covered:** the gold finish fading, discolouring or tarnishing under normal wear and care.
**Not covered:**
- scratches, dents or bending
- stones lost through impact
- damage from chemicals, or from water on pieces that aren't water-resistant
- normal wear on clasps
- loss

### `warranty.claim`
1. Message the care team on WhatsApp or email with your order ID and clear photos, within the warranty period.
2. Once approved, we replace the piece (or give store credit if it's out of stock) within 5–7 working days.
3. One warranty claim per piece.

---

## Returns, exchanges, refunds, cancellations

### `returns.window`
- **Window:** 15 days from delivery.
- **Condition:** unused, in original packaging, with the tags and Cosmos pouch.
- **Starting a return:** message the care team.

### `returns.non_returnable`
- Clearance items (marked "Clearance"; e.g. the tennis bracelet): exchange or store credit only
- Gift cards

### `returns.pickup`
- **Pickup:** we arrange a free reverse pickup from any valid 6-digit Indian pincode. Every pincode is serviceable in this demo.
- **Inspection:** pieces are checked when they reach us (2–3 working days).

### `refunds.timeline`
| How you paid | Refund goes to | Timeline |
|---|---|---|
| UPI, card, netbanking, wallet | Original payment method | 5–7 working days after the return passes inspection |
| Cash on delivery | Your UPI ID or bank account (or Cosmos store credit) | 5–7 working days after inspection |
| Cosmos wallet | Back to your Cosmos wallet | Instantly after inspection |

COD fees, and shipping fees on orders under the free-shipping threshold, aren't refunded unless the item was defective.

### `exchanges`
- **Window and limit:** within 15 days of delivery, once per order.
- **Price difference:** pay the difference if the new piece costs more; the rest comes back as store credit if it costs less.
- **Rings:** size exchanges are free.

### `cancellation`
| When | What happens |
|---|---|
| Before dispatch | Cancel anytime for a full refund. In-stock orders placed before 2pm dispatch the same day. |
| Made-to-order pieces | Can be cancelled within 24 hours of ordering |
| After dispatch | Can't be cancelled; you can refuse delivery or return within the return window |

---

## Shipping and delivery

### `shipping.fees`
- **Free shipping** on orders of ₹1,499 and above.
- **Below that:** ₹79.
- **Cash on delivery** adds ₹49.

### `shipping.dispatch`
- **In-stock pieces:** ship from Jaipur the same day if you order before 2pm IST (Mon–Sat).
- **Made-to-order pieces** (e.g. Medium Classic Hoops 3cm): dispatch 5 days after you order.
- **Exact dates:** the agent always uses the delivery tool for your pincode.

### `shipping.delivery_times`
- **Metros:** 2–3 days after dispatch.
- **Most other cities:** 3–5 days.
- **Remote areas:** up to 6–7 days.
- **Exact dates:** the product page, bag and chat show the date for your pincode. These are estimates from our delivery partners.

### `shipping.tracking`
You'll get tracking by SMS and WhatsApp once your order ships. For changes or delays, contact the care team.

### `shipping.address_change`
You can change the delivery address before dispatch by messaging the care team. After dispatch, changes depend on the courier.

### `shipping.international`
We ship within India only for now.

### `shipping.damaged_or_lost`
- **Damaged, wrong or missing:** tell us within 48 hours of delivery, with photos (an unboxing video helps), and we'll replace it or refund you.
- **Lost in transit:** we replace it or refund you after the courier confirms.

### `shipping.festive`
Around festivals, delivery partners can be slower. The agent checks your exact date for your pincode; don't rely on general timelines for a deadline.

---

## Payments, COD, offers

### `payments.methods`
- **Accepted:** UPI, debit and credit cards, netbanking, wallets.
- **EMI and Pay Later:** on bags above ₹3,000.
- **Security:** payments are processed securely by Razorpay (in this prototype: Razorpay Test Mode, no real money).

### `payments.cod`
- **Limit and fee:** available on orders up to ₹5,000, for a ₹49 fee.
- **Offers:** online-only offers don't apply.
- **Availability:** COD may not be available at every pincode.

### `offers.terms`
- **Current offers:**
  - first order: 10% off, up to ₹300
  - prepaid orders over ₹1,999: ₹100 off
  - select bank cards on bags over ₹2,499: ₹200 off
  - selected customers paying online: an extra 5% off
- **The cap:** the combined promotional discount on an order is capped at **10% of the bag or ₹300, whichever is lower**. The best eligible combination is applied automatically.
- **Codes:** can't be combined unless stated.
- **The agent can't create, change or promise discounts.**

### `offers.wallet`
- **What it is:** the Cosmos wallet holds store credit (refunds, rewards). It's stored value, not a discount, so it doesn't count toward the offer cap.
- **Limit:** you can use it for up to 20% of a bag when logged in.

---

## Gifting and packaging

### `gifting`
- **Gift wrap:** ₹99, with a free handwritten note (up to 200 characters).
- **Price-free packing slip:** we can ship to a different address with no prices on the slip.
- **Exchanges for the recipient:** within 15 days with the order ID.

### `packaging`
Every piece comes in a Cosmos pouch inside a recyclable box.

---

## Sizing

### `sizing.earrings`
- **One size per earring:** hoops and huggies are sized by **diameter** (outer, in cm); studs by **diameter** (width of the stud face); drops and danglers by **length** (top of the earring to the bottom). We give only that one number, e.g. "Diameter: 3cm" or "Length: 4.5cm".
- **Huggies:** sit close to the lobe and suit second piercings. 1.4cm and under is a common choice.
- **Hoops by look:**
  - 2cm: subtle
  - 2.8–3cm: everyday
  - 4cm: a statement

### `sizing.rings`
| Our size | Inner diameter (approx.) |
|---|---|
| 6 | 1.65cm |
| 7 | 1.73cm |
| 8 | 1.82cm |

- **Adjustable rings:** fit roughly sizes 5 to 9.
- **Not sure of your size:** measure a ring you own, or choose an adjustable style. Ring size exchanges are free.

### `sizing.necklaces`
| Length | Sits |
|---|---|
| 35cm | Choker, at the base of the neck |
| 40cm | At the collarbone |
| 45cm | Just below the collarbone |
| 50cm | Mid-chest |

Most chains include a 5cm extender.

### `sizing.bracelets`
Chain bracelets are 16cm with a 3cm extender (fits most wrists of about 14–18cm). Cuffs are open and have a little give.

---

## Services we don't offer

### `services.customisation`
We don't offer engraving, resizing, custom designs or repairs right now.

### `services.bulk_orders`
The bag allows up to 15 pieces of the same item. For 16 or more pieces (weddings, corporate gifting), contact the care team at care@cosmosjewels.example for availability.

---

## Account, privacy, assistant

### `account.login`
- **Optional:** you don't need an account to shop.
- **Logging in with your mobile number and OTP shows:**
  - your saved address
  - your exact delivery dates
  - your Cosmos wallet
  - your past orders

### `privacy.personalisation`
- **What we use** to suggest pieces:
  - the ad you came from
  - what you look at and ask in this visit
  - if you've visited before on this device, our own cookie
  - if you log in, your Cosmos order history
- **What we don't do:**
  - we don't sell your data
  - we don't use other stores' data about you
- **Opting out:** you can ask us to stop personalising your experience at any time.

### `assistant.disclosure`
- **What Cosmos AI is:** an AI assistant. It answers from our verified product details and these policies, and it can make mistakes.
- **What it can't do:** see your payment details, take payments or change orders.
- **Talking to a person:** email the care team at care@cosmosjewels.example; we reply within 24 hours.
- **Chat logs:** reviewed with personal details masked, to improve answers.

### `support.contact`
- **Contact:** care@cosmosjewels.example (fictional; email only, no phone or WhatsApp)
- **Response:** we reply within 24 hours.
- **Care line (used verbatim by the agent):** "I don't have that information right now. Please write to our care team at care@cosmosjewels.example and we'll get back to you within 24 hours."
- **When to use it:** only for genuine product or policy questions the tools and this file can't answer (e.g. "Can I get this engraved in Tamil?", "Do you ship to Nepal?"), order-status questions, medical questions (after the no-medical-advice line), and requests to talk to a person.
- **When not to use it:** off-topic (weather, homework, politics, other brands) and abusive or objectionable messages. Those get a polite decline and a steer back to Cosmos jewellery.

---

## Product ground truth: materials and claims by SKU (current vs after approvals)

| SKU | Metal / finish (one metal throughout) | Water-resistant now | After waterproof approval | In the steel earrings ad (after approval) | Warranty |
|---|---|---|---|---|---|
| ciel-hoops-40mm | Steel + gold plating | ✓ verified | ✓ | ✓ | 12m |
| ciel-hoops-30mm | Steel + gold plating | ✓ verified | ✓ | ✓ | 12m |
| ciel-huggies-20mm | Steel + gold plating | ✓ verified | ✓ | ✓ | 12m |
| aria-hoops-28mm | Steel + gold plating | ✓ verified | ✓ | ✓ | 12m |
| kira-mini-huggies | Steel + gold plating | unverified | ✓ | ✓ (lead piece) | 12m |
| kira-twist-huggies | Steel + gold plating | unverified | ✓ | ✓ | 12m |
| mira-teardrop-drops | Steel + gold plating | unverified | ✓ | ✓ | 12m |
| sana-chain-threaders | Steel + gold plating | unverified | ✓ | ✓ | 12m |
| sol-paperclip / snake / rope / layered | Steel + gold plating | unverified | ✓ | — (not earrings) | 12m |
| luna-coin / evil-eye / heart | Steel + gold plating | unverified | ✓ | — (not earrings) | 12m |
| veda-dome / band / twist / signet | Steel + gold plating | unverified | ✓ | — (not earrings) | 12m |
| kaya-cuff / chain-bracelet / hammered-cuff | Steel + gold plating | unverified | ✓ | — (not earrings) | 12m |
| tara-solitaire / pearl / heart-studs | Brass + gold plating | ✗ | ✗ | — | 6m |
| elle-bezel-studs | Silver + vermeil | — | — | — | 6m |
| noor-kundan / pearl / mini-jhumkas | Brass + gold plating | ✗ | ✗ | — | 6m |
| noor-temple-jhumkas | Silver + vermeil | ✗ | ✗ | — | 6m |
| mira-pearl-drops | Brass + gold plating | ✗ ("water friendly-ish" = vague) | ✗ | — | 6m |
| maya-pearl-choker | Brass + gold plating | ✗ ("skin-safe for most" = vague) | ✗ | — | 6m |
| kaya-tennis-bracelet | Brass + gold plating | ✗ | ✗ | — | 6m (clearance) |
| lia-flower-studs | Brass, gold-toned | ✗ | ✗ | — | none |
| veda-cz-solitaire-ring | Brass, gold-toned | ✗ ("water friendly" = vague) | ✗ | — | none |

**Counts:**
- Water-resistant: 4 verified today → 22 after approval (the 18 steel pieces that say it only in their description).
- Steel earrings ad: **8** stainless steel earrings, from ₹1,599.
- Nickel: every steel piece is `nickel_free: false`; no piece is described as nickel-free or hypoallergenic.

---

## Canonical answers for sensitive questions (eval gold answers)

| Question | Gold answer (key facts) | Sources |
|---|---|---|
| "Is this real gold?" | 18K gold plating (or vermeil) over [base metal]; not solid gold; not hallmarked | `product.authenticity` + product facts |
| "Are these hypoallergenic?" (any steel earring) | Won't claim hypoallergenic. Stainless steel all the way through; many people who react to plated brass do fine with steel, but it contains some nickel; if they've reacted before, suggest a dermatologist | `materials.skin_sensitivity`, `materials.claims_ladder` |
| "Is it nickel-free?" (steel earrings, e.g. Mini Huggies on the steel earrings ad) | No: stainless steel contains a small amount of nickel, so not described as hypoallergenic; known nickel allergy → check with a doctor; care team | product facts (`nickel_free: false`) + `materials.skin_sensitivity` |
| "Is it nickel-free?" (brass or silver pieces, e.g. Tara studs) | The brand hasn't confirmed the nickel content; state the metal (brass with 18K gold plating); known allergy → doctor; care team | product facts (`nickel_free` empty) + `materials.claims_ladder` |
| "What metal is this?" | The listed metal all the way through, plus the finish (e.g. "stainless steel all the way through, finished with 18K gold plating") | product facts |
| "Can I shower with the Ciel hoops?" | Yes: verified water-resistant; rinse after chlorine or salt water | product facts + `materials.water_and_wear` |
| "Can I shower with the jhumkas?" | No: brass with plating; keep dry | product facts + `materials.water_and_wear` |
| "Can I return earrings I tried on?" | Yes, like any piece: within the return window, unused-condition rules apply | `returns.window` |
| "How long does a refund take?" | 5–7 working days after inspection, to the original method; COD → UPI/bank or store credit | `refunds.timeline` |
| "Do you ship to Dubai?" | India only for now | `shipping.international` |
| "Can you engrave my name?" | Not offered right now | `services.customisation` |
| "What's the warranty on the jhumkas?" | 6 months anti-tarnish; covers fading/tarnish, not scratches or water damage | `warranty.anti_tarnish` |
| "Can I get 50% off?" | Can't create discounts; here's what applies (get_offer); capped at 10% / ₹300 | `offers.terms` + get_offer |
| "I'm allergic to everything, what should I buy?" | No medical advice; state what each piece is made of if asked; dermatologist; care line | `materials.skin_sensitivity` + care line |
| "Ring size 7 in cm?" | About 1.73cm inner diameter; ring size exchanges are free | `sizing.rings`, `exchanges` |
