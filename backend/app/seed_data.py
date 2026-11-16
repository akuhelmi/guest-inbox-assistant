"""FAKE demo data. Every property, guest and message here is invented.

Each message carries a saved triage result (category, urgent, reason, draft reply), so the
inbox loads instantly without spending LLM quota. "Re-run triage" in the UI calls the live
provider on the same text.
"""

# Fact sheets: the only property details a draft may use. Invented, like everything else.
PROPERTIES: list[dict] = [
    {
        "key": "bangsar",
        "name": "Bangsar Loft",
        "city": "Bangsar, Kuala Lumpur",
        "facts": {
            "check_in": "From 3pm, self check-in with a smart lock (code sent on arrival day)",
            "check_out": "By 11am",
            "wifi": "Network BangsarLoft-Guest, password bangsar2026",
            "parking": "One free bay in the basement, B1-07",
            "house_rules": "No smoking, no parties, quiet hours 11pm to 7am",
            "utilities": "Main water valve: cupboard under the kitchen sink (red handle). "
            "Gas valve: behind the stove",
            "caretaker": "Our maintenance and cleaning team covers all of KL, 10 to 40 min away",
        },
    },
    {
        "key": "garden",
        "name": "Garden Terrace House",
        "city": "Petaling Jaya",
        "facts": {
            "check_in": "From 1pm (cleaning until 1pm), self check-in with a lockbox at any "
            "time after that; bags can be dropped from 10am",
            "check_out": "By 11am",
            "wifi": "Network GardenTerrace, password tehtarik88",
            "parking": "Private driveway for 2 cars",
            "pets": "Small dogs welcome, one-off cleaning fee RM40; garden fully fenced",
            "house_rules": "Quiet hours after 11pm (residents' association rule)",
            "nearby": "Breakfast: Kopitiam Mesra, 7-minute walk, opens 7am",
        },
    },
    {
        "key": "skyline",
        "name": "Skyline Studio 12B",
        "city": "KLCC, Kuala Lumpur",
        "facts": {
            "check_in": "From 3pm, door code sent by message on arrival day; backup lockbox "
            "code available from the host",
            "check_out": "By 12pm",
            "wifi": "Network Skyline12B, password klcc2026; router in the TV cabinet",
            "parking": "Visitor parking on level P2: take a ticket, the host sends a free exit "
            "pass; lift lobby next to bay 40",
            "house_rules": "No smoking; pool open 7am to 10pm",
            "caretaker": "Our maintenance and cleaning team covers all of KL, 10 to 40 min away",
        },
    },
    {
        "key": "kampung",
        "name": "Kampung Chalet",
        "city": "Hulu Langat, Selangor",
        "facts": {
            "check_in": "From 2pm, the caretaker meets you at the chalet",
            "check_out": "By 11am; late check-out until 2pm is free when there is no arrival "
            "that day",
            "wifi": "Network KampungChalet, password hululangat",
            "parking": "Free parking next to the chalet",
            "max_guests": "Sleeps up to 4; extra guest fee RM50 per night",
            "cancellation": "Free cancellation up to 7 days before arrival",
            "utilities": "Fuse box behind the front door",
            "caretaker": "Our maintenance and cleaning team covers all of KL, 10 to 40 min away",
        },
    },
]

# minutes_ago: how long before seeding the message arrived.
MESSAGES: list[dict] = [
    {
        "property": "skyline",
        "guest": "Daniel Weber",
        "task": {
            "title": "Call the guest and send the backup lockbox code",
            "assignee": "host",
            "due_minutes": 5,
        },
        "facts_used": ["check_in", "caretaker"],
        "confidence": "high",
        "minutes_ago": 6,
        "body": "Hi, we're standing outside the building and the door code isn't working. "
        "We're locked out with two kids and all our luggage. Please help!",
        "category": "check_in",
        "urgent": True,
        "reason": "Guests are locked out at arrival with children.",
        "draft": "Hi Daniel, I'm so sorry, I'm on it right now. I'm calling you in the next "
        "2 minutes and sending the backup lockbox code by message. If the door still won't "
        "open, someone from our team will come over straight away.",
    },
    {
        "property": "bangsar",
        "guest": "Priya Nair",
        "task": {
            "title": "Plumber: ceiling leak in the bathroom",
            "assignee": "maintenance",
            "due_minutes": 30,
        },
        "facts_used": ["utilities", "caretaker"],
        "confidence": "high",
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
        "facts_used": ["check_in"],
        "confidence": "high",
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
        "task": {
            "title": "Send the extension request for Saturday night",
            "assignee": "host",
            "due_minutes": 120,
        },
        "facts_used": [],
        "confidence": "medium",
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
        "task": {
            "title": "Change the linen and deep-clean the bathroom",
            "assignee": "cleaner",
            "due_minutes": 180,
        },
        "facts_used": [],
        "confidence": "medium",
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
        "property": "bangsar",
        "guest": "Sophie Martin",
        "task": {
            "title": "Technician: bedroom aircon blinking red",
            "assignee": "maintenance",
            "due_minutes": 240,
        },
        "facts_used": [],
        "confidence": "medium",
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
        "facts_used": ["nearby"],
        "confidence": "high",
        "minutes_ago": 120,
        "body": "Is there a good place for breakfast within walking distance? "
        "Somewhere local would be great.",
        "category": "general_question",
        "urgent": False,
        "reason": "Asks for a local breakfast recommendation.",
        "draft": "Hi Rajesh, great question! Try Kopitiam Mesra, a 7-minute walk "
        "away, for white coffee and kaya toast. It opens at 7am and gets busy after 9.",
    },
    {
        "property": "kampung",
        "guest": "Lucas Silva",
        "facts_used": ["cancellation"],
        "confidence": "high",
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
        "facts_used": ["parking"],
        "confidence": "high",
        "minutes_ago": 190,
        "body": "Where do we park? Is there visitor parking in the building?",
        "category": "check_in",
        "urgent": False,
        "reason": "Asks about parking at arrival.",
        "draft": "Hi Hannah, yes: visitor parking is on level P2. Take a ticket at the gate "
        "and I'll send you a free exit pass for your stay. The lift lobby is right next to bay 40.",
    },
    {
        "property": "bangsar",
        "guest": "Oliver Brown",
        "task": {
            "title": "Gas check: smell at the stove",
            "assignee": "maintenance",
            "due_minutes": 30,
        },
        "facts_used": ["utilities"],
        "confidence": "high",
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
        "task": {
            "title": "Talk to the neighbours about quiet hours",
            "assignee": "host",
            "due_minutes": 480,
        },
        "facts_used": ["house_rules"],
        "confidence": "medium",
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
        "task": {
            "title": "Add one guest from Friday to the booking",
            "assignee": "host",
            "due_minutes": 240,
        },
        "facts_used": ["max_guests"],
        "confidence": "high",
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
        "task": {
            "title": "Check the router; bring a mobile hotspot",
            "assignee": "maintenance",
            "due_minutes": 60,
        },
        "facts_used": ["wifi"],
        "confidence": "medium",
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
        "property": "bangsar",
        "guest": "Farid Ismail",
        "facts_used": [],
        "confidence": "high",
        "minutes_ago": 500,
        "body": "Thank you for the lovely stay! Everything was perfect.",
        "category": "general_question",
        "urgent": False,
        "reason": "Thank-you message, no action needed.",
        "draft": "Hi Farid, thank you so much, it was a pleasure hosting you! We'd love to have "
        "you back at Bangsar Loft anytime. Safe travels home.",
    },
    {
        "property": "garden",
        "guest": "Chloe Dubois",
        "facts_used": ["check_in"],
        "confidence": "high",
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
        "facts_used": ["check_out"],
        "confidence": "high",
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
        "task": {
            "title": "Handyman: blocked toilet",
            "assignee": "maintenance",
            "due_minutes": 120,
        },
        "facts_used": [],
        "confidence": "medium",
        "minutes_ago": 850,
        "body": "The toilet is blocked and won't flush. Can someone come?",
        "category": "maintenance",
        "urgent": False,
        "reason": "Blocked toilet.",
        "draft": "Hi Nur Aina, sorry about this. There's a plunger in the cabinet under the "
        "sink; if that doesn't fix it, our handyman can come within 2 hours. Just let me know.",
    },
    {
        "property": "bangsar",
        "guest": "James Taylor",
        "task": {
            "title": "Pest control, then deep-clean the kitchen",
            "assignee": "cleaner",
            "due_minutes": 240,
        },
        "facts_used": [],
        "confidence": "medium",
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
        "facts_used": ["pets"],
        "confidence": "high",
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
        "task": {
            "title": "Caretaker: power cut, check the fuse box",
            "assignee": "maintenance",
            "due_minutes": 20,
        },
        "facts_used": ["utilities", "caretaker"],
        "confidence": "high",
        "minutes_ago": 1400,
        "body": "Power cut in the chalet, no electricity at all. Everything is dark.",
        "category": "maintenance",
        "urgent": True,
        "reason": "No electricity in the whole chalet.",
        "draft": "Hi Ben, sorry about this. The fuse box is behind the front door: please check "
        "whether the main switch has tripped and push it back up. I'm calling you now, and if "
        "that doesn't fix it our caretaker will be there within 20 minutes.",
    },
    {
        "property": "skyline",
        "guest": "Grace Okafor",
        "task": {
            "title": "Ask building management about pool heating and BBQ",
            "assignee": "host",
            "due_minutes": 60,
        },
        "minutes_ago": 22,
        "body": "Is the rooftop pool heated? And can we use the BBQ pits up there tonight?",
        "category": "general_question",
        "urgent": False,
        "reason": "Asks about pool heating and BBQ use; not on the fact sheet.",
        "draft": "Hi Grace, thanks for asking! The pool is open 7am to 10pm. I don't want to "
        "guess about the heating or the BBQ pits, so I'll check with building management and "
        "get back to you within the hour.",
        "facts_used": ["house_rules"],
        "confidence": "low",
    },
    {
        "property": "skyline",
        "guest": "Hafiz Rahim",
        "task": {
            "title": "Caretaker: no water supply since morning",
            "assignee": "maintenance",
            "due_minutes": 15,
        },
        "minutes_ago": 9,
        "language": "ms",
        "body": "Tolong! Air tak keluar langsung dari paip sejak pagi. Kami tak boleh mandi.",
        "category": "maintenance",
        "urgent": True,
        "reason": "No water at all since the morning.",
        "draft": "Hai Hafiz, maaf atas kesulitan ini. Kami sedang uruskan sekarang: pasukan "
        "penyelenggaraan kami akan datang secepat mungkin untuk memeriksa bekalan air. "
        "Saya akan hubungi anda sebentar lagi.",
        "facts_used": ["caretaker"],
        "confidence": "high",
    },
    {
        "property": "garden",
        "guest": "Nurul Aisyah",
        "minutes_ago": 75,
        "language": "ms",
        "body": "Salam, boleh kami daftar masuk awal esok pukul 11 pagi? Penerbangan kami "
        "tiba pukul 9.",
        "category": "check_in",
        "urgent": False,
        "reason": "Asks for early check-in at 11am tomorrow.",
        "draft": "Salam Nurul, terima kasih! Rumah sedang dibersihkan sehingga pukul 1 "
        "petang, tetapi saya akan cuba sediakan lebih awal dan sahkan malam ini. Anda boleh "
        "tinggalkan beg di rumah mulai pukul 10 pagi.",
        "facts_used": ["check_in"],
        "confidence": "high",
    },
    {
        "property": "bangsar",
        "guest": "Wang Li",
        "minutes_ago": 40,
        "language": "zh",
        "body": "你好，请问WiFi密码是多少？我们找不到。",
        "category": "general_question",
        "urgent": False,
        "reason": "Asks for the Wi-Fi password.",
        "draft": "Wang Li，您好！WiFi 网络名称是 BangsarLoft-Guest，密码是 bangsar2026。"
        "如果连接不上，请随时告诉我。",
        "facts_used": ["wifi"],
        "confidence": "high",
    },
    {
        "property": "kampung",
        "guest": "Chen Jie",
        "minutes_ago": 260,
        "language": "zh",
        "body": "我们星期天可以延迟退房到下午两点吗？",
        "category": "booking_change",
        "urgent": False,
        "reason": "Asks for a 2pm late check-out on Sunday.",
        "draft": "Chen Jie，您好！如果当天没有新客人入住，可以免费延迟到下午两点退房。"
        "我确认后马上告诉您。",
        "facts_used": ["check_out"],
        "confidence": "medium",
    },
    {
        "property": "garden",
        "guest": "Camille Laurent",
        "minutes_ago": 540,
        "language": "fr",
        "body": "Bonjour, est-ce qu'il y a un parking sur place ? Nous arrivons en voiture samedi.",
        "category": "check_in",
        "urgent": False,
        "reason": "Asks about parking for arrival by car.",
        "draft": "Bonjour Camille, oui : la maison dispose d'une allée privée pour deux "
        "voitures. L'arrivée est possible à partir de 13h avec la boîte à clés. Bon voyage !",
        "facts_used": ["parking", "check_in"],
        "confidence": "high",
    },
]


# The demo team (D23). Invented people, all based around Kuala Lumpur, so everyone can reach
# every property; the nearest free person gets the job. "skills" match the task assignee kinds.
TEAM: list[dict] = [
    {
        "id": "aiman",
        "name": "Aiman",
        "role": "Maintenance",
        "base": "Cheras",
        "skills": ["maintenance"],
    },
    {
        "id": "ravi",
        "name": "Ravi",
        "role": "Maintenance",
        "base": "Petaling Jaya",
        "skills": ["maintenance"],
    },
    {"id": "lina", "name": "Lina", "role": "Cleaning", "base": "Bangsar", "skills": ["cleaner"]},
    {
        "id": "joyce",
        "name": "Joyce",
        "role": "Cleaning",
        "base": "Mont Kiara",
        "skills": ["cleaner"],
    },
    {
        "id": "rosli",
        "name": "Rosli",
        "role": "All-rounder",
        "base": "Ampang",
        "skills": ["maintenance", "cleaner"],
    },
]

# Driving minutes from each person's base to each property (fixed, invented, KL traffic).
TRAVEL_MINUTES: dict[str, dict[str, int]] = {
    "aiman": {"skyline": 20, "bangsar": 25, "garden": 35, "kampung": 25},
    "ravi": {"skyline": 30, "bangsar": 15, "garden": 10, "kampung": 50},
    "lina": {"skyline": 15, "bangsar": 5, "garden": 15, "kampung": 45},
    "joyce": {"skyline": 20, "bangsar": 15, "garden": 20, "kampung": 50},
    "rosli": {"skyline": 15, "bangsar": 25, "garden": 35, "kampung": 20},
}

# Today's booked jobs (D24). Times are minutes from the start of the visitor's demo, so
# someone is always busy "now" whenever the demo is opened.
JOBS: list[dict] = [
    {
        "person": "aiman",
        "property": "garden",
        "title": "Aircon service",
        "start": -20,
        "minutes": 110,
    },
    {
        "person": "ravi",
        "property": "bangsar",
        "title": "Water heater check",
        "start": 60,
        "minutes": 60,
    },
    {
        "person": "lina",
        "property": "skyline",
        "title": "Turnover clean",
        "start": -30,
        "minutes": 90,
    },
    {
        "person": "joyce",
        "property": "garden",
        "title": "Turnover clean",
        "start": 120,
        "minutes": 120,
    },
    {
        "person": "rosli",
        "property": "kampung",
        "title": "Garden and pool clean-up",
        "start": 30,
        "minutes": 60,
    },
]
