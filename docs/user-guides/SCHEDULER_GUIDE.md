# Scheduler (Booking) - User Guide

The Scheduler lets clients book appointments with your team through an online booking page (powered by Cal.com). It appears as a **Booking** widget on a Contact or Lead record.

## Sending a booking link

1. Open the **Contact** or **Lead** you want to schedule with and find the **Booking** widget on the record.
2. Make sure the record has a **client email**. Without one you'll see "Client email required" / "Add an email address before sending a booking link."
3. The widget builds a **pre-filled booking link**: it fills in the client's name and email and tags the booking with this CRM contact/lead and your tenant, so the resulting booking links back to the right record automatically. A short link is also generated.
4. Use **Open booking page** to preview the booking calendar in a new tab, or **Copy booking link** to send it to the client yourself.

## Which calendar is used

The booking link points to the **assigned employee's** personal booking calendar. If the record is unassigned, it falls back to the **current user's** calendar.

## Reviewing booking history

The **Booking History** on the record lists past bookings, each showing the date and time plus a status badge:

- **confirmed**, **pending**, **cancelled**, **completed**, **no_show**

When a client picks a slot on the booking page, the booking syncs back into the CRM and appears here. If there are none yet, you'll see "No bookings yet."

## Troubleshooting

- **"Booking not configured" / "Assign an employee with a booking calendar to enable this"** — the record needs an assigned employee who has a booking calendar set up.
- **"The saved booking page is missing or invalid"** — the assigned employee's booking link is broken or no longer exists; have them reconnect their booking calendar.
