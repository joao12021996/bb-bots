import React from "react";
import { HasText } from "../layout/text";
import { APP_NAME, HOH, LAST_CHANCE, POWER_NAMES, VETO } from "../../playerMode/terms";
import { cartoonCast } from "../../cartoon/cartoon";
import { reducedMotion } from "../../prefs/motion";
import { useLanguage } from "../../i18n/i18n";
import { HERO_FR, SECTIONS_FR } from "./tutorialFr";

export interface Section {
    id: string;
    emoji: string;
    title: string;
    body: React.ReactNode;
}

// A few cartoon houseguests to decorate the page (always the same ones).
const FACES = cartoonCast(6, 2024);

const SECTIONS_EN: Section[] = [
    {
        id: "goal",
        emoji: "🏠",
        title: "The goal",
        body: (
            <>
                <p>
                    A house full of houseguests, no way out except one at a time. Every week someone is voted out,
                    until two are left. Then the evicted houseguests in the jury vote for the winner.
                </p>
                <p>
                    To win you have to survive the votes <em>and</em> keep the jury on your side. If you win too much
                    you become a target, and if you betray too many people the jury won't vote for you.
                </p>
            </>
        ),
    },
    {
        id: "week",
        emoji: "📅",
        title: "A week in the house",
        body: (
            <ol className="bbb-tutorial-steps">
                <li>
                    <b>{HOH} comp.</b> Everyone competes. The winner is the {HOH} (HoH): safe for the week, and the one
                    who nominates.
                </li>
                <li>
                    <b>Social time.</b> Talk, make deals and alliances, and visit the HoH room to plead your case.
                </li>
                <li>
                    <b>Nominations.</b> The HoH puts two houseguests on the block.
                </li>
                <li>
                    <b>{VETO} comp.</b> The HoH, the nominees and a few random houseguests play. The winner may take
                    a nominee off the block, and then the HoH names a replacement.
                </li>
                <li>
                    <b>Eviction.</b> Everyone except the HoH and the nominees votes. Most votes is evicted; the HoH
                    breaks a tie.
                </li>
            </ol>
        ),
    },
    {
        id: "social",
        emoji: "🤝",
        title: "The social game",
        body: (
            <>
                <p>
                    In each social block you get a few actions. Each one is a chance to change how someone feels about
                    you, and those feelings drive every bot decision: who they nominate, who they evict, and who they
                    vote to win.
                </p>
                <ul>
                    <li>
                        <b>Chat</b> to build a friendship. <b>Pitch</b> a target to someone ("we should go after
                        them").
                    </li>
                    <li>
                        <b>Alliances</b>: start one or join one. Allies protect each other, until they don't.
                    </li>
                    <li>
                        <b>Deals</b>: final-two promises, vote deals, telling people who you're voting for (true or
                        not), flirting, confrontations, house meetings, snooping and rumours.
                    </li>
                    <li>
                        Bots come to <em>you</em> too, with pitches, invitations and fights where you have to pick a
                        side.
                    </li>
                </ul>
                <p>
                    Bots lie, and they keep track of promises. Breaking one is remembered, and the jury remembers it
                    as well.
                </p>
            </>
        ),
    },
    {
        id: "comps",
        emoji: "🏆",
        title: "Competitions",
        body: (
            <>
                <p>
                    Comps are short games you play yourself: memory, puzzles, reflexes, quizzes about what happened in
                    the house, luck, and endurance. Play any of them on its own from <b>🧪 Test a comp</b>.
                </p>
                <ul>
                    <li>
                        <b>House Comics</b>: two comic covers per houseguest, one real and one fake. Find every real
                        one before time runs out.
                    </li>
                    <li>
                        <b>Memory Duel</b>: one-on-one concentration. Turn over one card at a time; find a pair and
                        you go again. The winner stays on and the loser is out.
                    </li>
                    <li>
                        <b>Knockout</b>: head-to-head duels until one is left. <b>Tainted Wine</b>: the pourer
                        offers you a glass and may bluff about it. Drink the tainted one twice and you're out.
                    </li>
                    <li>
                        <b>Hide the {VETO}</b> breaks ties: everyone hides one {VETO.toLowerCase()} and the first
                        hiding place found loses.
                    </li>
                </ul>
                <p>
                    Bots have a comp score, but every comp they also get luck, so an underdog can have a great day.
                    Early in the season some bots throw comps on purpose to stay out of the spotlight. Once the jury
                    starts, nobody throws.
                </p>
            </>
        ),
    },
    {
        id: "twists",
        emoji: "🌀",
        title: "Twists and powers",
        body: (
            <>
                <p>
                    Seasons can include twists, which you set up under <b>Edit Season/Twists</b>: double and triple
                    evictions, co-HoHs, a split house, Three on the Block, special vetoes, and more. Some weeks a third
                    nominee plays a {LAST_CHANCE} to get off the block.
                </p>
                <p>
                    Secret powers can appear during the season: {POWER_NAMES.immunity}, {POWER_NAMES.extraVote},{" "}
                    {POWER_NAMES.nullifier}, {POWER_NAMES.overthrow}, {POWER_NAMES.ghostSwap},{" "}
                    {POWER_NAMES.secretHoh}, {POWER_NAMES.battleBack} and the {POWER_NAMES.audience}. Nobody else
                    knows you have one. When it's time to use it, you'll be asked.
                </p>
            </>
        ),
    },
    {
        id: "finale",
        emoji: "⚖️",
        title: "Jury and finale",
        body: (
            <p>
                Once the jury starts, every evicted houseguest joins it. At the final two, jurors ask questions, you
                answer, and they vote. They reward a good game and punish broken promises, so a clean record can beat
                a pile of comp wins.
            </p>
        ),
    },
    {
        id: "ways",
        emoji: "🎮",
        title: "Ways to play",
        body: (
            <ul>
                <li>
                    <b>📺 Watch the bots</b>: every houseguest is a bot. Step through the season week by week.
                </li>
                <li>
                    <b>🎮 Play as a houseguest</b>: solo, or pass-and-play with friends on one device. Private screens
                    (votes, secret powers, decisions) come one player at a time behind a 🔒 hand-off. Everything
                    else is watched together: results, ceremonies, speeches, and a comp only one of you is in. The
                    hand-off always says whether the next screen is private.
                </li>
                <li>
                    <b>🥾 Hall of Losers and 🏆 Hall of Winners</b>: every season you play keeps its first houseguest out
                    and its winner. On the casting screen, load either hall for a season of them, as the exact same
                    bots: same faces, skills and personalities.
                </li>
                <li>
                    <b>🌐 Play online</b>: host a game and share the code. The house starts full of bots, and every
                    friend who joins takes the place of one. Late to the party? Tap 👀 Just watch to follow the season live.
                </li>
                <li>
                    <b>🎓 Guided season</b>: new to the game? Turn on Guided season when you set up (it's on until you've
                    finished a season) and a coach explains each part of the week the first time it comes up. ✨ Set up a
                    gentle first season picks a small house, Casual bots and no twists for you.
                </li>
                <li>
                    <b>🎚️ Difficulty and 📜 House rules</b>: from Casual (forgiving bots) to Cutthroat (bots that doubt
                    you and break their word). House rules set the jury size, whether the Head of House plays in the
                    Veto, big three-nominee weeks, actions per social block, and which kinds of comp come up.
                </li>
                <li>
                    <b>🎨 Your avatar</b>: build a cartoon of yourself feature by feature (skin, hair, eyes, glasses,
                    hats and more), roll a random one, or use a photo.
                </li>
                <li>
                    <b>🔗 Share a cast</b>: on the Casting screen, 📤 Share this cast gives you a link that opens the
                    game with your cast (names, looks, ratings and relationships). 📥 Load a cast takes a code a friend
                    sent you.
                </li>
            </ul>
        ),
    },
];

export function TutorialPage(): JSX.Element {
    const lang = useLanguage();
    const SECTIONS = lang === "fr" ? SECTIONS_FR : SECTIONS_EN;
    const hero =
        lang === "fr" ? HERO_FR : { kicker: "How to play", title: `Welcome to ${APP_NAME}`, lead: "Everything you need to know to outlast the house, in two minutes." };
    return (
        <HasText>
            <div className="bbb-tutorial">
                <div className="bbb-hero">
                    <div className="bbb-hero-kicker">{hero.kicker}</div>
                    <h1>{hero.title}</h1>
                    <p>{hero.lead}</p>
                    <div className="bbb-tutorial-faces" aria-hidden="true">
                        {FACES.map((f) => (
                            <img key={f.name} src={f.imageURL} alt="" />
                        ))}
                    </div>
                </div>
                <nav className="bbb-tutorial-toc">
                    {SECTIONS.map((s) => (
                        <a
                            key={s.id}
                            href={`#tutorial-${s.id}`}
                            onClick={(e) => {
                                // scroll, but leave the URL alone (it can carry an online join code)
                                e.preventDefault();
                                const el = document.getElementById(`tutorial-${s.id}`);
                                if (el) el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
                            }}
                        >
                            {s.emoji} {s.title}
                        </a>
                    ))}
                </nav>
                {SECTIONS.map((s) => (
                    <section key={s.id} id={`tutorial-${s.id}`} className="bbb-tutorial-section">
                        <h2>
                            <span className="bbb-tutorial-emoji">{s.emoji}</span> {s.title}
                        </h2>
                        {s.body}
                    </section>
                ))}
            </div>
        </HasText>
    );
}
