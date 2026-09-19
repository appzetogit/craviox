# Craviox Gold (Memberships): Flutter Implementation Guide

This covers everything the Flutter user app needs for memberships. The server
does all the maths. The app **never** calculates discounts itself; it only shows
what the API returns.

- **Base URL:** `https://craviox.com/api`
- **Auth:** `Authorization: Bearer <accessToken>` on every call below
- **Envelope:** `{ "success": true, "message": "...", "data": { ... } }`
- **Errors:** `{ "success": false, "message": "<show this to the user>" }`

---

## 1. Screens to build

| Screen | Where | What it shows |
|---|---|---|
| **Membership page** | New route, e.g. `/membership` | Hero (member status or pitch), plan cards, buy buttons, history |
| **Profile card** | Top of Profile, above Wallet | "Gold Member · valid till …" or "Join Craviox Gold" |
| **Cart banner** | Above bill details | Members: "Gold benefits applied, you save ₹X". Non-members: "Save ₹X with Gold" (tap to open the Membership page) |
| **Bill rows** | Bill details | "Gold Discount −₹X" row; delivery shows "FREE with Gold" |
| **Order detail** | Past order bill | Same rows, from the stored order pricing |

---

## 2. Endpoints

| Method | Path | Body | Returns (`data`) |
|---|---|---|---|
| GET | `/v1/food/user/memberships/plans` | none | `{ plans: Plan[] }` |
| GET | `/v1/food/user/memberships/me` | none | `MyMembership` |
| POST | `/v1/food/user/memberships/purchase/order` | `{ planId }` | `{ plan, razorpay: { key, orderId, amount, currency } }` |
| POST | `/v1/food/user/memberships/purchase/verify` | `{ planId, razorpayOrderId, razorpayPaymentId, razorpaySignature }` | `MyMembership` |
| POST | `/v1/food/user/memberships/purchase/wallet` | `{ planId, requestId }` | `MyMembership` |

Both purchase calls return the refreshed `MyMembership`, so update the UI
straight from the response without a second fetch.

---

## 3. Models

```dart
class MembershipPerks {
  final bool freeDelivery;
  final double freeDeliveryMinOrder;   // 0 = any order
  final double freeDeliveryMaxKm;      // 0 = no limit
  final double extraDiscountPercent;   // 0 = none
  final double maxDiscountPerOrder;    // 0 = no cap
  final double discountMinOrder;
  final bool stackWithCoupons;
  final bool waivePlatformFee;
  final bool waiveSurge;               // no quick-delivery surcharge
  final double cashbackPercent;        // credited to wallet on delivery
  final double maxCashbackPerOrder;
  final String restaurantScope;        // "all" | "selected"
  final List<String> restaurantIds;    // partner restaurants when "selected"
  final List<String> extraPerks;       // free-text bullets, show as-is

  MembershipPerks.fromJson(Map<String, dynamic> j)
      : freeDelivery = j['freeDelivery'] == true,
        freeDeliveryMinOrder = _d(j['freeDeliveryMinOrder']),
        freeDeliveryMaxKm = _d(j['freeDeliveryMaxKm']),
        extraDiscountPercent = _d(j['extraDiscountPercent']),
        maxDiscountPerOrder = _d(j['maxDiscountPerOrder']),
        discountMinOrder = _d(j['discountMinOrder']),
        stackWithCoupons = j['stackWithCoupons'] != false,
        waivePlatformFee = j['waivePlatformFee'] == true,
        waiveSurge = j['waiveSurge'] == true,
        cashbackPercent = _d(j['cashbackPercent']),
        maxCashbackPerOrder = _d(j['maxCashbackPerOrder']),
        restaurantScope = j['restaurantScope'] ?? 'all',
        restaurantIds = List<String>.from(j['restaurantIds'] ?? const []),
        extraPerks = List<String>.from(j['extraPerks'] ?? const []);
}

/// A plan is the perks plus the selling fields. Perk keys are at the top level.
class MembershipPlan {
  final String id, name, tagline, description, badgeColor; // badgeColor "#D4A017"
  final double price, originalPrice;  // originalPrice 0 = don't show strike-through
  final int durationDays;
  final bool isFeatured;
  final MembershipPerks perks;

  MembershipPlan.fromJson(Map<String, dynamic> j)
      : id = j['id'], name = j['name'], tagline = j['tagline'] ?? '',
        description = j['description'] ?? '', badgeColor = j['badgeColor'] ?? '#D4A017',
        price = _d(j['price']), originalPrice = _d(j['originalPrice']),
        durationDays = j['durationDays'] ?? 30, isFeatured = j['isFeatured'] == true,
        perks = MembershipPerks.fromJson(j);
}

class UserMembership {
  final String id, planId, planName, badgeColor, source, status; // source: razorpay|wallet|admin_grant
  final double pricePaid;                                         // status: active|expired|cancelled
  final DateTime startsAt, expiresAt;
  final MembershipPerks perks;       // snapshot taken at purchase time: use THIS, not the plan

  UserMembership.fromJson(Map<String, dynamic> j)
      : id = j['id'], planId = j['planId'], planName = j['planName'],
        badgeColor = j['badgeColor'] ?? '#D4A017', source = j['source'], status = j['status'],
        pricePaid = _d(j['pricePaid']),
        startsAt = DateTime.parse(j['startsAt']).toLocal(),
        expiresAt = DateTime.parse(j['expiresAt']).toLocal(),
        perks = MembershipPerks.fromJson(Map<String, dynamic>.from(j['perks'] ?? {}));
}

class MyMembership {
  final bool isMember;
  final UserMembership? current;
  final List<UserMembership> upcoming; // renewals queued after current
  final List<UserMembership> history;
  final double totalSavings;           // lifetime savings on member orders
  final int ordersCount;

  MyMembership.fromJson(Map<String, dynamic> j)
      : isMember = j['isMember'] == true,
        current = j['current'] == null ? null : UserMembership.fromJson(j['current']),
        upcoming = (j['upcoming'] as List? ?? []).map((e) => UserMembership.fromJson(e)).toList(),
        history = (j['history'] as List? ?? []).map((e) => UserMembership.fromJson(e)).toList(),
        totalSavings = _d(j['totalSavings']),
        ordersCount = j['ordersCount'] ?? 0;
}

double _d(dynamic v) => v == null ? 0 : (v is num ? v.toDouble() : double.tryParse('$v') ?? 0);
Color hexColor(String h) => Color(int.parse('FF${h.replaceFirst('#', '').padRight(6, '0').substring(0, 6)}', radix: 16));
```

---

## 4. Showing perks as text

Build the plan-card bullets from the perks. Keep the wording identical to the web app:

```dart
List<String> perkLines(MembershipPerks p) {
  final l = <String>[];
  String rs(double v) => '₹${v.toStringAsFixed(0)}';
  if (p.freeDelivery) {
    var s = 'Unlimited free delivery';
    if (p.freeDeliveryMinOrder > 0) s += ' on orders above ${rs(p.freeDeliveryMinOrder)}';
    if (p.freeDeliveryMaxKm > 0) s += ' (within ${p.freeDeliveryMaxKm} km)';
    l.add(s);
  }
  if (p.extraDiscountPercent > 0) {
    var s = 'Extra ${p.extraDiscountPercent.toStringAsFixed(0)}% off';
    if (p.maxDiscountPerOrder > 0) s += ' up to ${rs(p.maxDiscountPerOrder)}';
    if (p.stackWithCoupons) s += ', even with coupons';
    if (p.restaurantScope == 'selected') s += ' at partner restaurants';
    l.add(s);
  }
  if (p.waiveSurge) l.add('No surge fee, even at peak hours');
  if (p.waivePlatformFee) l.add('Zero platform fee');
  if (p.cashbackPercent > 0) {
    var s = '${p.cashbackPercent.toStringAsFixed(0)}% cashback to your wallet';
    if (p.maxCashbackPerOrder > 0) s += ' (up to ${rs(p.maxCashbackPerOrder)} per order)';
    l.add(s);
  }
  l.addAll(p.extraPerks);
  return l;
}

String durationLabel(int d) =>
    d % 365 == 0 ? (d == 365 ? '1 year' : '${d ~/ 365} years')
  : d % 30 == 0 ? (d == 30 ? '1 month' : '${d ~/ 30} months')
  : '$d days';
```

---

## 5. Buying a plan

### 5a. Razorpay (`razorpay_flutter`)

```dart
final _razorpay = Razorpay();
String? _pendingPlanId;

void initRazorpay() {
  _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onSuccess);
  _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse r) =>
      showError(r.message ?? 'Payment failed. Please try again.'));
}

Future<void> buyWithRazorpay(MembershipPlan plan) async {
  final res = await api.post('/v1/food/user/memberships/purchase/order', {'planId': plan.id});
  final rz = res['data']['razorpay'];
  _pendingPlanId = plan.id;
  _razorpay.open({
    'key': rz['key'],
    'amount': rz['amount'],            // paise, straight from the server
    'currency': rz['currency'] ?? 'INR',
    'order_id': rz['orderId'],
    'name': 'Craviox',
    'description': '${plan.name} membership - ${durationLabel(plan.durationDays)}',
    'prefill': {'contact': user.phone, 'name': user.name ?? ''},
    'notes': {'type': 'membership', 'planId': plan.id},
  });
}

Future<void> _onSuccess(PaymentSuccessResponse r) async {
  final res = await api.post('/v1/food/user/memberships/purchase/verify', {
    'planId': _pendingPlanId,
    'razorpayOrderId': r.orderId,
    'razorpayPaymentId': r.paymentId,
    'razorpaySignature': r.signature,
  });
  membership = MyMembership.fromJson(res['data']);  // perks are live immediately
  showSuccess('Welcome to ${membership.current?.planName}!');
}

@override
void dispose() { _razorpay.clear(); super.dispose(); }
```

**Retry `verify` if it fails with a network error.** It is safe to call more
than once: the same Razorpay order can never activate twice. If verify still
fails, tell the user to contact support. Their money was taken, and support can
grant the membership from the admin panel.

### 5b. Wallet

Only enable the Wallet button when `walletBalance >= plan.price`. Balance comes from `GET /v1/food/user/wallet`.

```dart
Future<void> buyWithWallet(MembershipPlan plan) async {
  // One requestId per tap. Reuse it if you retry the same tap, so a retry never charges twice.
  final requestId = DateTime.now().millisecondsSinceEpoch.toString();
  final res = await api.post('/v1/food/user/memberships/purchase/wallet',
      {'planId': plan.id, 'requestId': requestId});
  membership = MyMembership.fromJson(res['data']);
}
```

Server error messages to show as-is: `Insufficient wallet balance`,
`This plan is no longer available`, `Payment verification failed`.

### Renewals
If the user is already a member, label the button **"Extend"** instead of
"Join". A new purchase is queued to start when the current membership ends
(it appears in `upcoming`), so the user never loses paid days. Show:
*"Renewal queued: Gold from 12 Dec 2026"*.

---

## 6. Cart and checkout: what changed in pricing

`POST /v1/food/orders/calculate` already returns everything. **Do not add new
maths.** Read these extra fields from `data.pricing`:

| Field | Type | Meaning |
|---|---|---|
| `membershipDiscount` | number | Extra discount from the membership. **Already subtracted from `total`** |
| `membershipSavings` | number | Everything the membership saved on this order (for "You save ₹X") |
| `membership` | object / null | Present only for members (see below) |
| `membershipUpsell` | object / null | Present only for non-members, when a plan would save money on this cart |

```jsonc
"membership": {
  "active": true,
  "eligible": true,            // false = this restaurant isn't a partner; no perks applied
  "planName": "Gold",
  "expiresAt": "2026-12-18T10:00:00.000Z",
  "deliveryFeeWaived": 40,     // pricing.deliveryFee is already 0
  "platformFeeWaived": 10,     // pricing.platformFee already reduced
  "surgeWaived": 25,           // quick-mode surcharge not charged
  "extraDiscount": 80,         // == pricing.membershipDiscount
  "totalSavings": 155
}
"membershipUpsell": { "planId": "…", "planName": "Gold", "badgeColor": "#D4A017", "price": 149, "durationDays": 90, "savings": 155 }
```

### Rendering rules
1. **Banner above the bill:**
   - `membership?.eligible == true && totalSavings > 0` → gold banner: *"Gold benefits applied. You save ₹155 on this order"*
   - else if `membershipUpsell != null && savings > 0` → tappable banner: *"Save ₹155 on this order with Gold · Join for ₹149 / 90 days"* → opens the Membership page
2. **Bill rows:**
   - If `membershipDiscount > 0`, add a row **"{planName} Discount  −₹X"** under the coupon row.
   - Delivery: if `deliveryFee == 0` and `membership.deliveryFeeWaived > 0`, show **"FREE with {planName}"**. Optionally strike through `₹{deliveryFeeWaived}`.
   - Quick mode: if `membership.surgeWaived > 0`, **hide the Quick Mode charge row** (or show it struck through). Don't fall back to the configured quick fee. The server returns `quickDeliveryFee: 0` on purpose.
   - **Total:** always show `pricing.total`, as-is.
3. **After buying a membership on the cart path**, call `/orders/calculate` again so the new perks show up.
4. **Placing the order needs no extra fields.** The server re-checks the membership when the order is created and records `membershipId`, `membershipDiscount` and `membershipSavings` on the order.

### Order detail / history
`GET /v1/food/orders/:orderId` → `order.pricing` now includes
`membershipDiscount`, `membershipSavings` and `membershipId`. If `membershipSavings > 0`,
show *"You saved ₹X with your membership"* on the order bill.

---

## 7. Cashback
If the plan has `cashbackPercent > 0`, cashback is credited automatically when
the order is **delivered**. It appears in the normal wallet history, with a
description like *"Cashback (Gold) on order FOD-…"*. Nothing to call; just
refresh the wallet.

---

## 8. Edge cases

| Situation | What to do |
|---|---|
| `GET /plans` returns `[]` | Hide the profile card's "Join" state and the Membership menu entry, or show "Coming soon" |
| Membership expired | `me.isMember == false`, and `history` shows it as `expired`. Show the join pitch again |
| Admin cancelled it | `status: "cancelled"`. Perks stop immediately |
| Admin gifted it | `source: "admin_grant"`, `pricePaid: 0`. Show "Gift" instead of the price in history |
| `membership.eligible == false` | Member at a non-partner restaurant. Show a small note: *"Gold perks aren't available at this restaurant"* |
| Plan edited by admin | Existing members keep the perks they bought (`current.perks`). Always use the membership's perks, not the plan's |
| Cache | Refetch `/memberships/me` on app resume, after a purchase and after an order is delivered |

---

## 9. QA checklist
- [ ] Buy with Razorpay → the Membership page flips to the member view without a restart
- [ ] Buy with wallet → balance drops by the plan price; the button is disabled when the balance is too low
- [ ] Kill the app during Razorpay success → reopen → retry verify → exactly one membership
- [ ] Buy while already a member → shows up under "Renewal queued"
- [ ] Cart as member: delivery "FREE with Gold", discount row, total matches the server
- [ ] Cart as member below the free-delivery minimum → normal delivery fee
- [ ] Quick mode with a no-surge plan → no Quick Mode charge
- [ ] Cart as non-member → upsell banner opens the Membership page
- [ ] Delivered member order with a cashback plan → wallet credited
- [ ] Order history shows the membership savings
