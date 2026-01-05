export type ContentType = 'video' | 'pdf' | 'text';
export type SkillLevel = 'Foundation' | 'Performance' | 'Elite';

export interface Drill {
  id: string;
  title: string;
  contentType: ContentType;
  description: string;
  source: string; // YouTube URL, PDF path, or text content
  category: string;
  duration?: string; // For video drills
  xpValue: number;
  estimatedMinutes: number;
  level: SkillLevel;
}

export const DRILLS: Drill[] = [
  {
    id: '1',
    title: 'Mastering Your Short Game',
    contentType: 'video',
    description: 'Learn the fundamentals of chipping and putting with Coach Sarah Thompson.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'Short Game',
    duration: '8:42',
    xpValue: 50,
    estimatedMinutes: 9,
    level: 'Foundation'
  },
  {
    id: '2',
    title: 'Driving Range Fundamentals',
    contentType: 'video',
    description: 'Perfect your swing mechanics and increase your driving distance.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'Driving',
    duration: '12:15',
    xpValue: 75,
    estimatedMinutes: 12,
    level: 'Foundation'
  },
  {
    id: '3',
    title: 'Golf Course Strategy Guide',
    contentType: 'pdf',
    description: 'A comprehensive guide to course management and strategic play.',
    source: '/sample-golf-strategy.pdf',
    category: 'Strategy',
    xpValue: 100,
    estimatedMinutes: 20,
    level: 'Performance'
  },
  {
    id: '4',
    title: 'Putting Practice Routine',
    contentType: 'text',
    description: 'A detailed 30-day putting practice routine designed to improve your accuracy and consistency on the green.',
    source: `Putting is one of the most critical aspects of golf, and consistent practice is key to improvement. This 30-day routine is designed to build muscle memory, improve your stroke, and increase your confidence on the green.

**Week 1: Foundation Building**
- Day 1-3: Focus on your putting stance and grip. Practice 50 putts from 3 feet.
- Day 4-5: Work on your backswing and follow-through. Practice 30 putts from 5 feet.
- Day 6-7: Combine stance, grip, and stroke. Practice 40 putts from various distances.

**Week 2: Distance Control**
- Day 8-10: Practice lag putting from 20-30 feet. Focus on getting within 3 feet of the hole.
- Day 11-12: Work on uphill and downhill putts. Practice 25 putts of each.
- Day 13-14: Practice breaking putts. Set up 5 different break scenarios and practice each.

**Week 3: Pressure Situations**
- Day 15-17: Practice 3-foot putts under pressure. Set a goal of making 20 in a row.
- Day 18-19: Practice 5-foot putts with consequences (miss and start over).
- Day 20-21: Simulate tournament conditions with various putt scenarios.

**Week 4: Refinement**
- Day 22-24: Focus on your weakest areas identified in previous weeks.
- Day 25-26: Practice putting from various lies (uphill, downhill, sidehill).
- Day 27-28: Full course putting practice, simulating real game scenarios.
- Day 29-30: Review and refine your technique, focusing on consistency.

Remember: Consistency is more important than perfection. Practice daily, even if it's just 15 minutes.`,
    category: 'Putting',
    xpValue: 150,
    estimatedMinutes: 30,
    level: 'Foundation'
  },
  {
    id: '5',
    title: 'Swing Analysis Techniques',
    contentType: 'video',
    description: 'Learn how to analyze and improve your golf swing using video analysis.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'Technique',
    duration: '15:30',
    xpValue: 60,
    estimatedMinutes: 16,
    level: 'Performance'
  },
  {
    id: '6',
    title: 'Mental Game Workbook',
    contentType: 'pdf',
    description: 'Exercises and strategies to strengthen your mental game on the course.',
    source: '/mental-game-workbook.pdf',
    category: 'Mental Game',
    xpValue: 80,
    estimatedMinutes: 25,
    level: 'Elite'
  },
  {
    id: '7',
    title: 'Advanced Putting Techniques',
    contentType: 'video',
    description: 'Master advanced putting strategies for competitive play.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'Putting',
    duration: '18:00',
    xpValue: 120,
    estimatedMinutes: 18,
    level: 'Elite'
  },
  {
    id: '8',
    title: 'Irons Mastery Guide',
    contentType: 'text',
    description: 'Complete guide to mastering your iron shots.',
    source: `Iron play is the foundation of consistent scoring. This guide covers everything you need to know about hitting crisp, accurate iron shots.

**Fundamentals:**
1. **Stance**: Feet shoulder-width apart, ball positioned slightly forward of center
2. **Grip**: Neutral grip with hands working together
3. **Posture**: Slight knee bend, spine tilted away from target
4. **Alignment**: Clubface square to target, body parallel to target line

**Swing Mechanics:**
- Takeaway: Smooth, one-piece takeaway keeping club low to the ground
- Backswing: Full shoulder turn, weight shifts to back foot
- Downswing: Weight shifts forward, hands lead the clubhead
- Impact: Ball-first contact, divot after the ball
- Follow-through: Full finish with weight on front foot

**Practice Drills:**
- 9-to-3 drill: Half swings focusing on impact position
- Alignment sticks: Use to ensure proper setup and swing path
- Distance control: Hit to specific targets at different distances
- Trajectory control: Practice high and low shots

**Common Mistakes:**
- Scooping the ball (trying to lift it)
- Over-swinging (losing control)
- Poor weight transfer
- Incorrect ball position

Practice these fundamentals daily and you'll see significant improvement in your iron play.`,
    category: 'Irons',
    xpValue: 90,
    estimatedMinutes: 25,
    level: 'Performance'
  },
  {
    id: '9',
    title: 'Power Driving Techniques',
    contentType: 'video',
    description: 'Increase your driving distance with advanced techniques.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'Driving',
    duration: '20:00',
    xpValue: 110,
    estimatedMinutes: 20,
    level: 'Elite'
  },
];

