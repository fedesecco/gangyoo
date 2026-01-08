# Gangyoo

Gangyoo is a Telegram bot for group chats. It keeps a lightweight list of members,
lets the group set a shared language (English or Italian), stores birthdays, and
can randomly nominate someone for a task.

## How to use it

1. Add Gangyoo to your group chat.
2. Each person should send a message in the group or type `/register` once so the
   bot can save their profile (name, username, id).
3. Optional: set the chat language with `/language` and pick from the buttons.
4. Save your birthday with `/birthday 24/12/1991` or `/birthday 1991-12-24`.
5. Use `/nominate` to pick a random member (including the requester).

## Commands

- `/register` save your profile in this chat
- `/language` set the chat language with buttons
- `/birthday <DD/MM/YYYY or YYYY-MM-DD>` save your birthday
- `/nominate` pick a random member

## Notes

- Telegram does not expose birthdays, so you must submit yours with `/birthday`.
- If the bot does not see normal messages in a group, ask the admin to disable
  Privacy Mode for the bot in BotFather.

## Credits

Created by Federico Secco (federico.secco7@gmail.com).
