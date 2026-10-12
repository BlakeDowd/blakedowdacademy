/**
 * Golf IQ quiz question banks. Rules answers follow the current Rules of Golf (stroke play) and stick to
 * clear-cut situations. Each question lists the correct option first; the quiz shuffles them on screen.
 */
export type GolfIqTopic = "rules" | "prep" | "strategy" | "mental";

export const GOLF_IQ_TOPIC_LABEL: Record<GolfIqTopic, string> = {
  rules: "Rules",
  prep: "Tournament prep",
  strategy: "Course management",
  mental: "Mental game",
};

export type GolfIqQuestion = {
  id: string;
  topic: GolfIqTopic;
  question: string;
  /** Correct answer first. */
  options: [string, string, string, string];
  explanation: string;
};

export type GolfIqLevel = {
  level: number;
  title: string;
  passMark: number;
  questions: readonly GolfIqQuestion[];
};

export const GOLF_IQ_LEVEL_1: GolfIqLevel = {
  level: 1,
  title: "Golf IQ: Level 1",
  passMark: 16,
  questions: [
    {
      id: "l1-arrive",
      topic: "prep",
      question: "How early should you get to the course before a tournament tee time?",
      options: ["45 to 60 minutes", "10 minutes", "5 minutes", "2 hours"],
      explanation: "45 to 60 minutes gives you time to register, warm up, putt and get to the tee without rushing.",
    },
    {
      id: "l1-warmup",
      topic: "prep",
      question: "What's the best order for a pre-round warm-up on the range?",
      options: [
        "Short wedges first, build up, finish with your first tee shot club",
        "Driver first to get loose, then wedges",
        "Hit as many drivers as you can",
        "Only hit your weakest club",
      ],
      explanation: "Start small to loosen up and find contact, work up through the bag, then rehearse the shot you'll hit on the first tee.",
    },
    {
      id: "l1-mark",
      topic: "prep",
      question: "Why should you put your own mark on your ball before the round?",
      options: [
        "So you can always tell your ball apart from others",
        "It's just for luck",
        "It makes the ball fly straighter",
        "So the ball is easier to find in the rough",
      ],
      explanation: "Lots of players use the same ball. Your own mark means you can always identify yours, and playing the wrong ball costs you shots.",
    },
    {
      id: "l1-breakfast",
      topic: "prep",
      question: "What's the best thing to eat before a morning tee time?",
      options: [
        "A proper breakfast like oats, or eggs on toast",
        "Nothing, play on an empty stomach",
        "Just an energy drink",
        "A packet of lollies on the first tee",
      ],
      explanation: "Slow-release carbs and some protein keep your energy steady for the first few holes. Sugar on its own spikes then crashes.",
    },
    {
      id: "l1-water",
      topic: "prep",
      question: "When should you drink water during a round?",
      options: [
        "Small amounts every few holes, before you feel thirsty",
        "Only when you feel thirsty",
        "A big bottle at the turn",
        "Only after the round",
      ],
      explanation: "By the time you feel thirsty you're already behind. Little and often keeps your focus and energy up on the back nine.",
    },
    {
      id: "l1-practice-green",
      topic: "prep",
      question: "What's the main job of your practice putts before the round?",
      options: [
        "Get a feel for how fast the greens are rolling",
        "Try out a new putting grip",
        "See how hard you can hit it",
        "Nothing much, the range is more important",
      ],
      explanation: "Every course rolls differently. Roll some long putts to learn the speed, then finish with a few short ones to see them go in.",
    },
    {
      id: "l1-pin",
      topic: "strategy",
      question: "The flag is tucked right, just over a deep bunker. Where should you aim with a mid iron?",
      options: ["The middle of the green", "Straight at the flag", "Just right of the flag", "Short of the bunker"],
      explanation: "Aim where a normal miss still finds the green. A middle-of-the-green shot keeps the bunker out of play and leaves a putt.",
    },
    {
      id: "l1-water-left",
      topic: "strategy",
      question: "There's water all down the left of the fairway. Where do you aim your tee shot?",
      options: [
        "The right half of the fairway, away from the water",
        "Down the left edge for the best angle",
        "Straight down the middle no matter what",
        "At the water so you curve it back",
      ],
      explanation: "Aim away from the trouble so your normal miss finishes in play. A shot in the right rough is far better than a penalty.",
    },
    {
      id: "l1-lag",
      topic: "strategy",
      question: "On a 15 m putt, what matters most?",
      options: ["Getting the speed right", "Holing it", "Reading every bit of break", "Hitting it firm past the hole"],
      explanation: "From long range, speed decides where you finish. Aim to leave it inside a tap-in circle to avoid three-putts.",
    },
    {
      id: "l1-chip",
      topic: "strategy",
      question: "Your ball is just off the green on short grass with nothing in the way. What's usually the safest shot?",
      options: ["A putt or low running chip", "A high flop shot", "A full wedge", "A bump into the bank"],
      explanation: "Get it rolling as soon as you can. A ball on the ground is much easier to control than one in the air.",
    },
    {
      id: "l1-trees",
      topic: "strategy",
      question: "You're in the trees with a small gap to the green and a wide gap back to the fairway. What should you do?",
      options: ["Chip out to the fairway", "Go for the small gap", "Hit it as hard as you can", "Take a big swing and hope"],
      explanation: "Take your medicine. Chipping out costs one shot; hitting a tree can cost three or more.",
    },
    {
      id: "l1-headwind",
      topic: "strategy",
      question: "You're hitting into a strong headwind. What usually happens to the ball?",
      options: [
        "It flies shorter, so take more club",
        "It flies further, so take less club",
        "Nothing, wind doesn't change much",
        "It flies shorter, so swing as hard as you can with the same club",
      ],
      explanation: "A headwind knocks the ball down and makes it curve more. Take one or two more clubs and make a smooth swing.",
    },
    {
      id: "l1-fairway-bunker",
      topic: "strategy",
      question: "You're in a fairway bunker with a high lip right in front of you. What's the priority?",
      options: [
        "Take enough loft to clear the lip and get back in play",
        "Take your longest club to get close to the green",
        "Hit a driver off the sand",
        "Aim straight at the flag no matter what",
      ],
      explanation: "Get out first. Hitting the lip can leave you still in the bunker, so take a club with enough loft even if it doesn't reach.",
    },
    {
      id: "l1-downhill",
      topic: "strategy",
      question: "Compared with a flat putt of the same length, how do downhill putts roll?",
      options: [
        "Further, so hit them softer",
        "Shorter, so hit them firmer",
        "The same, slope doesn't matter",
        "They always break more to the right",
      ],
      explanation: "Gravity keeps a downhill putt rolling. Pick a spot short of the hole and let the slope do the rest.",
    },
    {
      id: "l1-layup",
      topic: "strategy",
      question: "You're laying up on a par 5. Where's the best place to leave the ball?",
      options: [
        "At your favourite full wedge distance",
        "As close to the green as possible",
        "Anywhere, the next shot doesn't matter much",
        "Right next to the hazard so it's shorter in",
      ],
      explanation: "A full swing to your favourite distance is easier to control than an awkward half shot from close in.",
    },
    {
      id: "l1-bad-shot",
      topic: "mental",
      question: "You've just hit a bad shot. What's the best thing to do?",
      options: [
        "Accept it, let it go, and commit to the next one",
        "Hit a few practice swings to fix it",
        "Think about what went wrong all the way to the ball",
        "Try something different on the next shot",
      ],
      explanation: "The shot's gone. Give yourself a few seconds to react, then reset your focus on the next shot and your routine.",
    },
    {
      id: "l1-routine",
      topic: "mental",
      question: "What's the main job of a pre-shot routine?",
      options: [
        "To get you committed and focused the same way every shot",
        "To slow down the group behind",
        "To fix your swing mechanics",
        "To check your score",
      ],
      explanation: "The same routine every shot gets you committed, calms nerves and makes your swing feel familiar under pressure.",
    },
    {
      id: "l1-scoring",
      topic: "mental",
      question: "You're 2 under through 9 holes, your best ever. What should you focus on now?",
      options: ["Your next shot and your routine", "What you need to shoot to win", "Not making a bogey", "Your final score"],
      explanation: "Stay in the present. Thinking about the score brings tension. One shot at a time keeps you playing the way you were.",
    },
    {
      id: "l1-nerves",
      topic: "mental",
      question: "You feel nervous on the first tee. What helps most?",
      options: [
        "Slow, deep breaths and your normal routine",
        "Swing faster to get it over with",
        "Try a brand new swing thought",
        "Think about who's watching",
      ],
      explanation: "Nerves are normal. Slow breathing calms your body, and your usual routine gives your mind something familiar to do.",
    },
    {
      id: "l1-goal",
      topic: "mental",
      question: "What's the best kind of goal for a tournament round?",
      options: [
        "Commit to every shot and stick to your game plan",
        "Shoot a career best score",
        "Don't make a single bogey",
        "Beat the person you're playing with",
      ],
      explanation: "Score goals add pressure you can't control. Goals about how you play each shot are in your control and lead to better scores.",
    },
  ],
};

/** Rules questions held back for the separate Rules test. */
export const GOLF_RULES_QUESTIONS: readonly GolfIqQuestion[] = [
  {
    id: "l1-clubs",
    topic: "rules",
    question: "What's the most clubs you can carry in your bag during a round?",
    options: ["14", "12", "15", "As many as you like"],
    explanation: "The limit is 14. Count them on the first tee: carrying more costs 2 strokes for each hole you had them, up to 4 strokes.",
  },
  {
    id: "l1-red",
    topic: "rules",
    question: "Your ball is in a red penalty area and you can't play it. What does relief cost?",
    options: ["1 stroke", "No penalty", "2 strokes", "You have to replay from the tee"],
    explanation: "Relief from a penalty area is 1 stroke. With red stakes you can also drop within two club-lengths of where it last crossed the edge.",
  },
  {
    id: "l1-search",
    topic: "rules",
    question: "How long do you have to search for a lost ball?",
    options: ["3 minutes", "5 minutes", "1 minute", "As long as you need"],
    explanation: "3 minutes from when you start looking. After that it's lost, so hit a provisional if you think it might be.",
  },
  {
    id: "l1-ob",
    topic: "rules",
    question: "In a competition, you hit your tee shot out of bounds. What happens?",
    options: [
      "1 stroke penalty and hit again from the tee",
      "2 stroke penalty and drop where it went out",
      "No penalty, just hit again",
      "Drop near where it went out with 1 stroke penalty",
    ],
    explanation: "Out of bounds is stroke and distance: 1 penalty stroke and replay from where you last hit. Your next tee shot is your third.",
  },
  {
    id: "l1-provisional",
    topic: "rules",
    question: "Your drive might be lost in the trees. What must you do before you hit a provisional ball?",
    options: [
      "Tell your group it's a provisional",
      "Walk forward and look for the first ball",
      "Ask the other players for permission",
      "Nothing, just hit another ball",
    ],
    explanation: "You must announce it, ideally using the word \"provisional\". If you don't, the new ball is in play and the first one is lost with a penalty.",
  },
  {
    id: "l1-bunker",
    topic: "rules",
    question: "Which of these gets you a penalty in a bunker?",
    options: [
      "Touching the sand with your club in a practice swing",
      "Removing a loose leaf near your ball",
      "Wriggling your feet in to take your stance",
      "Raking the bunker after you've played out",
    ],
    explanation: "Touching the sand in a practice swing or your backswing is 2 strokes. Moving loose leaves and taking your stance are fine.",
  },
  {
    id: "l1-scorecard",
    topic: "rules",
    question: "You sign your card with a 4 on a hole where you actually made a 5. What happens?",
    options: ["You're disqualified", "The 5 is changed back with no penalty", "2 stroke penalty", "The 4 stands"],
    explanation: "Signing for a lower score on any hole is disqualification. Check every hole with your marker before you sign.",
  },
  {
    id: "l1-advice",
    topic: "rules",
    question: "During a competition you ask another player in your group what club they just hit. What's the penalty?",
    options: ["2 strokes", "No penalty", "1 stroke", "A warning"],
    explanation: "Asking for advice from anyone but your caddie is 2 strokes. Facts like yardages and the rules are fine to ask about.",
  },
  {
    id: "l1-late",
    topic: "rules",
    question: "You get to the first tee 3 minutes after your tee time, ready to play. What happens?",
    options: ["2 stroke penalty on the first hole", "No penalty", "You're disqualified", "1 stroke penalty"],
    explanation: "Up to 5 minutes late and ready to play is 2 strokes on the first hole. Any later is disqualification. Plan to be on the tee 10 minutes early.",
  },
];
