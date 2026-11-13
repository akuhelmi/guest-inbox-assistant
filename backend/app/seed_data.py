"""FAKE demo data. Every property, guest and message here is invented.

Each message carries a saved triage result (category, urgent, reason, draft reply), so the
inbox loads instantly without spending LLM quota. "Re-run triage" in the UI calls the live
provider on the same text.
"""

PROPERTIES: list[dict] = [
    {"key": "seaview", "name": "Seaview Loft", "city": "Penang"},
    {"key": "garden", "name": "Garden Terrace House", "city": "Ipoh"},
    {"key": "skyline", "name": "Skyline Studio 12B", "city": "Kuala Lumpur"},
    {"key": "kampung", "name": "Kampung Chalet", "city": "Langkawi"},
]

# minutes_ago: how long before seeding the message arrived.
MESSAGES: list[dict] = [
    {
        "property": "skyline",
        "guest": "Daniel Weber",
        "minutes_ago": 6,
        "body": "Hi, we're standing outside the building and the door code isn't working. "
        "We're locked out with two kids and all our luggage. Please help!",
        "category": "check_in",
        "urgent": True,
        "reason": "Guests are locked out at arrival with children.",
        "draft": "Hi Daniel, I'm so sorry, I'm on it right now. I'm calling you in the next "
        "2 minutes and sending the backup lockbox code by message. If the door still won't "
        "open, our caretaker Aiman can be there within 15 minutes.",
    },
    {
        "property": "seaview",
        "guest": "Priya Nair",
        "minutes_ago": 14,
        "body": "There's water leaking from the ceiling in the bathroom and it's flooding "
        "onto the floor. What should we do?",
        "category": "maintenance",
        "urgent": True,
        "reason": "Active leak flooding the bathroom: risk of damage.",
        "draft": "Hi Priya, thank you for telling us straight away. Please turn the main water "
        "valve off (cupboard under the kitchen sink, red handle) and keep away from the sockets "
        "near the wet floor. Our plumber is on the way and will call you within 20 minutes.",
    },
    {
        "property": "garden",
        "guest": "Tom Hughes",
        "minutes_ago": 32,
        "body": "Hello! Could we check in early tomorrow, around 11am? Our flight lands at 9.",
        "category": "check_in",
        "urgent": False,
        "reason": "Asks for early check-in tomorrow.",
        "draft": "Hi Tom, welcome in advance! The house is being cleaned until 1pm, but I'll "
        "check if it can be ready by 11am and confirm tonight. If not, you're welcome to drop "
        "your bags at the house from 10am.",
    },
    {
        "property": "kampung",
        "guest": "Mei Ling Tan",
        "minutes_ago": 47,
        "body": "We're having a great time! Would it be possible to extend our stay by "
        "another night, until Sunday?",
        "category": "booking_change",
        "urgent": False,
        "reason": "Wants to extend the stay by one night.",
        "draft": "Hi Mei Ling, so glad you're enjoying the chalet! Saturday night is free, so "
        "you can stay until Sunday. I'll send the extension request through the booking app "
        "now; just accept it and you're all set.",
    },
    {
        "property": "skyline",
        "guest": "Ahmad Faris",
        "minutes_ago": 63,
        "body": "Honestly disappointed. The sheets have stains and the bathroom smells. "
        "This is not what the photos showed. Unacceptable for the price.",
        "category": "complaint",
        "urgent": False,
        "reason": "Unhappy with cleanliness; says the listing was not accurate.",
        "draft": "Hi Ahmad, I'm really sorry, that is not the standard we promise. Our "
        "housekeeper can come at a time that suits you today to change the linen and "
        "deep-clean the bathroom. I'll also look into what went wrong with this turnover.",
    },
    {
        "property": "seaview",
        "guest": "Sophie Martin",
        "minutes_ago": 88,
        "body": "The air conditioner in the bedroom stopped working last night. "
        "It just blinks a red light.",
        "category": "maintenance",
        "urgent": False,
        "reason": "Bedroom aircon not working (error light).",
        "draft": "Hi Sophie, sorry about the warm night. Could you try switching it off at the "
        "wall for 5 minutes and back on? If it still blinks red, our technician can come "
        "between 2 and 4pm today: just let me know if that works.",
    },
    {
        "property": "garden",
        "guest": "Rajesh Kumar",
        "minutes_ago": 120,
        "body": "Is there a good place for breakfast within walking distance? "
        "Somewhere local would be great.",
        "category": "general_question",
        "urgent": False,
        "reason": "Asks for a local breakfast recommendation.",
        "draft": "Hi Rajesh, great question! Try Kedai Kopi Sin Yoon Loong, a 7-minute walk "
        "away, for white coffee and kaya toast. It opens at 7am and gets busy after 9.",
    },
    {
        "property": "kampung",
        "guest": "Lucas Silva",
        "minutes_ago": 150,
        "body": "Hi, we need to cancel our booking for next month, family emergency. "
        "What is the cancellation policy?",
        "category": "booking_change",
        "urgent": False,
        "reason": "Wants to cancel next month's booking.",
        "draft": "Hi Lucas, I'm sorry to hear that, and I hope everyone is okay. Your booking "
        "has free cancellation up to 7 days before arrival, so you'll get a full refund. "
        "You can cancel in the booking app, or reply here and I'll do it for you.",
    },
    {
        "property": "skyline",
        "guest": "Hannah Lee",
        "minutes_ago": 190,
        "body": "Where do we park? Is there visitor parking in the building?",
        "category": "check_in",
        "urgent": False,
        "reason": "Asks about parking at arrival.",
        "draft": "Hi Hannah, yes: visitor parking is on level P2. Take a ticket at the gate "
        "and I'll send you a free exit pass for your stay. The lift lobby is right next to bay 40.",
    },
    {
        "property": "seaview",
        "guest": "Oliver Brown",
        "minutes_ago": 240,
        "body": "There is a strong smell of gas in the kitchen when we turn on the stove.",
        "category": "maintenance",
        "urgent": True,
        "reason": "Gas smell: a safety risk.",
        "draft": "Hi Oliver, please turn off the stove and the gas valve behind it now, open "
        "the windows, and don't use any switches or flames in the kitchen. I'm calling you "
        "right away, and our technician is coming to check it.",
    },
    {
        "property": "garden",
        "guest": "Aisha Rahman",
        "minutes_ago": 300,
        "body": "Our neighbours have been very noisy past midnight two nights in a row. "
        "We can't sleep.",
        "category": "complaint",
        "urgent": False,
        "reason": "Repeated noise at night from neighbours.",
        "draft": "Hi Aisha, I'm sorry, that sounds exhausting. I'll speak to the neighbours "
        "and the residents' association today about the quiet hours after 11pm. Please message "
        "me straight away if it happens again tonight.",
    },
    {
        "property": "kampung",
        "guest": "Kenji Sato",
        "minutes_ago": 360,
        "body": "Can we bring one more guest? My brother wants to join us on Friday.",
        "category": "booking_change",
        "urgent": False,
        "reason": "Wants to add a guest from Friday.",
        "draft": "Hi Kenji, of course, the chalet sleeps up to 4. I'll update the booking to "
        "add one guest from Friday; there's a small extra-guest fee, which I'll show in the "
        "change request for you to accept.",
    },
    {
        "property": "skyline",
        "guest": "Emma Wilson",
        "minutes_ago": 420,
        "body": "The wifi is down since this morning and I need it for work calls.",
        "category": "maintenance",
        "urgent": False,
        "reason": "Wifi not working; guest works remotely.",
        "draft": "Hi Emma, sorry about that. Could you unplug the router in the TV cabinet for "
        "30 seconds and plug it back in? If it's still down after 5 minutes, I'll send a "
        "technician and drop off a mobile hotspot in the meantime.",
    },
    {
        "property": "seaview",
        "guest": "Farid Ismail",
        "minutes_ago": 500,
        "body": "Thank you for the lovely stay! Everything was perfect.",
        "category": "general_question",
        "urgent": False,
        "reason": "Thank-you message, no action needed.",
        "draft": "Hi Farid, thank you so much, it was a pleasure hosting you! We'd love to have "
        "you back at Seaview Loft anytime. Safe travels home.",
    },
    {
        "property": "garden",
        "guest": "Chloe Dubois",
        "minutes_ago": 600,
        "body": "We're arriving late, around 11pm. Is self check-in available?",
        "category": "check_in",
        "urgent": False,
        "reason": "Late arrival; asks about self check-in.",
        "draft": "Hi Chloe, no problem at all: check-in is self-service with a lockbox, so "
        "any time works. I'll send the code and a short video of the entrance on your arrival day.",
    },
    {
        "property": "kampung",
        "guest": "Marco Rossi",
        "minutes_ago": 720,
        "body": "Could we get a late checkout on Sunday, maybe 2pm?",
        "category": "booking_change",
        "urgent": False,
        "reason": "Asks for a 2pm late check-out.",
        "draft": "Hi Marco, there's no arrival on Sunday, so a 2pm late check-out is fine. "
        "Enjoy the extra morning!",
    },
    {
        "property": "skyline",
        "guest": "Nur Aina",
        "minutes_ago": 850,
        "body": "The toilet is blocked and won't flush. Can someone come?",
        "category": "maintenance",
        "urgent": False,
        "reason": "Blocked toilet.",
        "draft": "Hi Nur Aina, sorry about this. There's a plunger in the cabinet under the "
        "sink; if that doesn't fix it, our handyman can come within 2 hours. Just let me know.",
    },
    {
        "property": "seaview",
        "guest": "James Taylor",
        "minutes_ago": 1000,
        "body": "Saw a few cockroaches in the kitchen last night. Pretty gross, to be honest.",
        "category": "complaint",
        "urgent": False,
        "reason": "Pests in the kitchen.",
        "draft": "Hi James, I'm sorry, that's not okay. I'm booking pest control for today at a "
        "time that suits you, and our cleaner will deep-clean the kitchen afterwards.",
    },
    {
        "property": "garden",
        "guest": "Siti Hajar",
        "minutes_ago": 1200,
        "body": "Are pets allowed? We'd like to bring our small dog next time.",
        "category": "general_question",
        "urgent": False,
        "reason": "Asks about the pet policy.",
        "draft": "Hi Siti, small dogs are welcome at the Garden Terrace House! Just add the pet "
        "when you book; there's a one-off cleaning fee. The garden is fully fenced.",
    },
    {
        "property": "kampung",
        "guest": "Ben Carter",
        "minutes_ago": 1400,
        "body": "Power cut in the chalet, no electricity at all. Everything is dark.",
        "category": "maintenance",
        "urgent": True,
        "reason": "No electricity in the whole chalet.",
        "draft": "Hi Ben, sorry about this. The fuse box is behind the front door: please check "
        "whether the main switch has tripped and push it back up. I'm calling you now, and if "
        "that doesn't fix it our caretaker will be there within 20 minutes.",
    },
]
