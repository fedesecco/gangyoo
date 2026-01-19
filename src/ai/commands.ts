export enum InferredCommand {
  Register = "register",
  Birthday = "birthday",
  Nominate = "nominate",
  Unknown = "unknown"
}

export type Command = {
  inferredCommand: InferredCommand;
  keywords: string[];
  instructions: string;
  exampleResponses: string[];
  extraResponseFields?: string;
};

export const COMMANDS: Command[] = [
  {
    inferredCommand: InferredCommand.Register,
    instructions: "The user is trying to make sure that the bot has its info registered. This might be already done. Just reply that you understood that user wants to be registered and it is now done",
    keywords: ["register", "/register", "join", "add me", "sign me up", "register me"],
    exampleResponses: [
      "{\"inferredCommand\":\"register\",\"responseText\":\"Ok bro i know that you exist dY~?\"}",
      "{\"inferredCommand\":\"register\",\"responseText\":\"Registered!!\"}",
      "{\"inferredCommand\":\"register\",\"responseText\":\"Done!\"}"
    ]
  },
  {
    inferredCommand: InferredCommand.Birthday,
    instructions: "The user wants you to remember its birthday. So if the user does not specify a day, month or year you should ask him to re-tag you with all the infos.",
    keywords: ["birthday", "bday", "/birthday", "date of birth"],
    exampleResponses: [
      "{\"inferredCommand\":\"birthday\",\"responseText\":\"Got it. I noted your birthday as 24/12/1991.\",\"birthday\":\"1991-12-24\"}",
      "{\"inferredCommand\":\"birthday\",\"responseText\":\"So you tell me your birthday without specifying the day? Are you retarded?\"}"
    ],
    extraResponseFields: "birthday: YYYY-MM-DD string"
  },
  {
    inferredCommand: InferredCommand.Nominate,
    instructions: "The user is trying to select a random user in the chat group (the actual user selected will be done by the app backend). In this case, you can send an empty response. The data that matters is that the inferredCommand is 'nominate'",
    keywords: ["nominate", "pick someone", "choose someone", "Who should do X?", "Who is the most X?"],
    exampleResponses: [
      "{\"inferredCommand\":\"nominate\",\"responseText\":\"\"}"
    ]
  },
  {
    inferredCommand: InferredCommand.Unknown,
    instructions: "Use this as the last resort if you think the user is not trying to execute any command above. Just answer the message according to the bot's style",
    keywords: ["hello", "how are you?"],
    exampleResponses: [
      "{\"inferredCommand\":\"unknown\",\"responseText\":\"???\"}",
      "{\"inferredCommand\":\"unknown\",\"responseText\":\"What?\"}"
    ]
  }
];
