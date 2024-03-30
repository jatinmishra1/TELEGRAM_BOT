import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import OpenAI from "openai";
import UserModel from "./src/models/User.js";
import EventModel from "./src/models/Event.js";
import connecDb from "./src/config/db.js";
import { message } from "telegraf/filters";
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"], // This is the default and can be omitted
});
try {
  connecDb();
  console.log("db connected ");
} catch (e) {
  console.log(e);
  process.kill(process.pid, "SIGTERM");
}

bot.start(async (cntxt) => {
  console.log("here is the context", cntxt);

  //store the userinfo into DB
  const from = cntxt.update.message.from;
  console.log("from is here", from);
  try {
    await UserModel.findOneAndUpdate(
      { tgId: from.id },
      {
        $setOnInsert: {
          firstName: from.first_name,
          lastName: from.last_name,
          isBot: from.is_bot,
          userName: from.username,
        },
      },
      { upsert: true, new: true }
    );
    cntxt.reply(
      `Hey ${from.first_name},bot has been started,we welcomes you here`
    );
  } catch (e) {
    console.log(e);
    cntxt.reply("facing difficulties");
  }

  console.log("bot has been started");
});

bot.command("generate", async (cntxt) => {
  const from = cntxt.update.message.from;

  const { message_id: waitingMessageId } = await cntxt.reply(
    `hey kindly wait for the moment,working hard to give the best results`
  );
  const { message_id: stickerWaitingId } = await cntxt.replyWithSticker(
    "CAACAgIAAxkBAAMxZgcZx3z75GpVE31DES3uPzdD0FUAAgkRAAKB0IlLnwle90Tw8Ck0BA"
  );

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfTheDay = new Date();
  endOfTheDay.setHours(23, 59, 59, 999);

  //get events for the user of teh same day
  const events = await EventModel.find({
    tgId: from.id,
    createdAt: {
      $gte: startOfDay,
      $lte: endOfTheDay,
    },
  });
  if (events.length === 0) {
    await cntxt.deleteMessage(waitingMessageId);
    await cntxt.deleteMessage(stickerWaitingId);
    cntxt.reply("no todays event found....");
    return;
  }
  console.log(events, "here are the events");
  //make open ai call

  try {
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "Act as a senior copywriter ,you write highly engaging posts for linkedin,facebook and twitter using provided thoughts/events through a day",
        },
        {
          role: "user",
          content: `Write Like a hunan, for humans. Craft tires engaging social media pouta tallared for Lintah, Factouk,
           and Twitter autionces, the staple Language. the gives tire labels Jat to understand the order of the event,
            don't mention the tite in the pasts. Each post should creatively highlight the following events. Ensure the tane is conversational and Inpectful. 
            Focus on engaging the respective platform's audience, encouraging interaction, and driving interest in the events: 
            ${events.map((event) => event.text).join(",")}
          `,
        },
      ],
      model: "gpt-3.5-turbo",
    });

    //store tokrn counts
    await UserModel.findOneAndUpdate(
      { tgId: from.id },
      {
        $inc: {
          promptTokens: chatCompletion.usage.prompt_tokens,
          completionTokens: chatCompletion.usage.completion_tokens,
        },
      }
    );

    cntxt.reply(chatCompletion.choices[0].message.content);
    await cntxt.deleteMessage(waitingMessageId);
    await cntxt.deleteMessage(stickerWaitingId);
    console.log("completion", chatCompletion);
  } catch (e) {
    await cntxt.deleteMessage(waitingMessageId);
    await cntxt.deleteMessage(stickerWaitingId);
    cntxt.reply("facing diff");
    console.log(e);
  }

  //send response
});

// bot.on(message("sticker"), (cntxt) => {
//   console.log("sticker", cntxt.update.message);
// });

bot.on(message("text"), async (cntxt) => {
  const from = cntxt.update.message.from;
  const message = cntxt.update.message.text;

  try {
    await EventModel.create({
      text: message,
      tgId: from.id,
    });
    cntxt.reply(
      "Message Noted,To generate the post please enter the command /generate"
    );
  } catch (e) {
    console.log(e);
    await cntxt.reply("difficult,please try again later");
  }
  // Explicit usage
});

bot.launch();
// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
