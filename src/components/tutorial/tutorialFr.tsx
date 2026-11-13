import React from "react";
import type { Section } from "./tutorialPage";

// The tutorial in French (see tutorialPage.tsx for the English). Keep the two in step.

export const HERO_FR = {
    kicker: "Comment jouer",
    title: "Bienvenue dans Houseguest Bots",
    lead: "Tout ce qu'il faut savoir pour survivre à la maison, en deux minutes.",
};

export const SECTIONS_FR: Section[] = [
    {
        id: "goal",
        emoji: "🏠",
        title: "Le but",
        body: (
            <>
                <p>
                    Une maison pleine de colocataires, et une seule façon d'en sortir : un par un. Chaque semaine,
                    quelqu'un est expulsé, jusqu'à ce qu'il en reste deux. Les colocataires expulsés du jury votent
                    alors pour le gagnant.
                </p>
                <p>
                    Pour gagner, il faut survivre aux votes <em>et</em> garder le jury de son côté. Gagne trop et tu
                    deviens une cible ; trahis trop de monde et le jury ne votera pas pour toi.
                </p>
            </>
        ),
    },
    {
        id: "week",
        emoji: "📅",
        title: "Une semaine dans la maison",
        body: (
            <ol className="bbb-tutorial-steps">
                <li>
                    <b>Épreuve du Chef de la maison.</b> Tout le monde s'affronte. Le gagnant devient Chef de la
                    maison : protégé pour la semaine, c'est lui qui nomine.
                </li>
                <li>
                    <b>Moment social.</b> Discute, passe des accords, forme des alliances et monte dans la chambre du
                    Chef pour plaider ta cause.
                </li>
                <li>
                    <b>Nominations.</b> Le Chef place deux colocataires sur la sellette.
                </li>
                <li>
                    <b>Épreuve du Veto.</b> Le Chef, les nominés et quelques colocataires tirés au sort jouent. Le
                    gagnant peut retirer un nominé de la sellette, et le Chef désigne alors un remplaçant.
                </li>
                <li>
                    <b>Expulsion.</b> Tout le monde vote, sauf le Chef et les nominés. Celui qui a le plus de voix
                    part ; en cas d'égalité, le Chef tranche.
                </li>
            </ol>
        ),
    },
    {
        id: "social",
        emoji: "🤝",
        title: "Le jeu social",
        body: (
            <>
                <p>
                    À chaque moment social, tu as quelques actions. Chacune est une occasion de changer ce que
                    quelqu'un pense de toi, et ces sentiments guident toutes les décisions des bots : qui ils
                    nominent, qui ils expulsent et pour qui ils votent en finale.
                </p>
                <ul>
                    <li>
                        <b>Discuter</b> pour créer une amitié. <b>Proposer</b> une cible à quelqu'un (« on devrait
                        s'en prendre à lui »).
                    </li>
                    <li>
                        <b>Alliances</b> : crées-en une ou rejoins-en une. Les alliés se protègent, jusqu'au jour où
                        ils arrêtent.
                    </li>
                    <li>
                        <b>Accords</b> : promesses de finale, échanges de votes, annonces de vote (vraies ou non),
                        flirts, confrontations, réunions de maison, espionnage et rumeurs.
                    </li>
                    <li>
                        Les bots viennent aussi te voir, avec des propositions, des invitations et des disputes où il
                        faut choisir son camp.
                    </li>
                </ul>
                <p>Les bots mentent, et ils notent les promesses. En trahir une, ça se paie, et le jury s'en souvient.</p>
            </>
        ),
    },
    {
        id: "comps",
        emoji: "🏆",
        title: "Les épreuves",
        body: (
            <>
                <p>
                    Les épreuves sont de petits jeux que tu joues toi-même : mémoire, casse-têtes, réflexes, quiz sur
                    ce qui s'est passé dans la maison, chance et endurance. Tu peux toutes les essayer depuis{" "}
                    <b>🧪 Tester une épreuve</b>.
                </p>
                <ul>
                    <li>
                        <b>BD de la maison</b> : deux couvertures par colocataire, une vraie et une fausse. Trouve
                        toutes les vraies avant la fin du temps.
                    </li>
                    <li>
                        <b>Duel de mémoire</b> : un memory en face à face. Retourne une carte à la fois ; trouve une
                        paire et tu rejoues. Le gagnant reste, le perdant sort.
                    </li>
                    <li>
                        <b>Duels à élimination</b> : des face-à-face jusqu'au dernier. <b>Vin empoisonné</b> : le
                        serveur t'offre un verre et peut bluffer. Bois deux fois le verre empoisonné et tu es éliminé.
                    </li>
                    <li>
                        <b>Cache le Veto</b> départage les égalités : chacun cache un veto, et la première cachette
                        trouvée perd.
                    </li>
                </ul>
                <p>
                    Les bots ont une note d'épreuve, mais ils ont aussi de la chance à chaque épreuve : un outsider
                    peut avoir un grand jour. En début de saison, certains bots perdent exprès pour rester discrets.
                    Une fois le jury commencé, plus personne ne lâche.
                </p>
            </>
        ),
    },
    {
        id: "twists",
        emoji: "🌀",
        title: "Rebondissements et pouvoirs",
        body: (
            <>
                <p>
                    Une saison peut contenir des rebondissements, à régler dans <b>Saison et rebondissements</b> :
                    doubles et triples expulsions, co-Chefs, maison divisée, trois nominés, vetos spéciaux, et plus.
                    Certaines semaines, un troisième nominé joue une épreuve de la dernière chance pour quitter la
                    sellette.
                </p>
                <p>
                    Des pouvoirs secrets peuvent apparaître : Immunité cachée, Vote supplémentaire, Annulation de vote,
                    Renversement, Échange fantôme, Chef de la maison secret, Retour en jeu et le Vote du public.
                    Personne d'autre ne sait que tu en as un. Le moment venu, on te demandera si tu veux t'en servir.
                </p>
            </>
        ),
    },
    {
        id: "finale",
        emoji: "⚖️",
        title: "Jury et finale",
        body: (
            <p>
                Une fois le jury commencé, chaque colocataire expulsé le rejoint. En finale à deux, les jurés posent
                des questions, tu réponds, et ils votent. Ils récompensent un beau jeu et punissent les promesses
                trahies : un parcours propre peut battre une pile de victoires.
            </p>
        ),
    },
    {
        id: "ways",
        emoji: "🎮",
        title: "Façons de jouer",
        body: (
            <ul>
                <li>
                    <b>📺 Regarder les bots</b> : tous les colocataires sont des bots. Suis la saison semaine après
                    semaine.
                </li>
                <li>
                    <b>🎮 Jouer un colocataire</b> : en solo, ou à plusieurs en se passant l'appareil. Les écrans privés
                    (votes, pouvoirs secrets, décisions) passent d'un joueur à l'autre derrière un 🔒 passage de main.
                    Tout le reste se regarde ensemble : résultats, cérémonies, discours, et une épreuve où un seul
                    d'entre vous joue. Le passage de main indique toujours si l'écran suivant est privé.
                </li>
                <li>
                    <b>🥾 Panthéon des perdants et 🏆 Panthéon des gagnants</b> : chaque saison jouée garde son premier
                    expulsé et son gagnant. Sur l'écran du casting, charge l'un des panthéons pour une saison avec eux,
                    exactement les mêmes bots : mêmes visages, notes et personnalités.
                </li>
                <li>
                    <b>🌐 Jouer en ligne</b> : crée une partie et partage le code. La maison commence pleine de bots,
                    et chaque ami qui arrive en remplace un. En retard ? Touche 👀 Juste regarder pour suivre la saison
                    en direct. Pour un grand groupe, règle le <b>⏰ Rythme</b> sur le temps réel : une pause d'une heure
                    à deux jours avant chaque épreuve et chaque expulsion (Chef de la maison un jour, Veto le
                    lendemain…), sauf si tous les joueurs votent pour avancer plus tôt.
                    L'hôte peut attendre tout le monde, ou commencer plus tôt avec des bots aux places vides. Avec ⏱️
                    Temps pour agir, qui met trop longtemps à décider laisse un bot faire ce choix-là. Besoin d'une
                    pause ? ⏸️ Demande-la : elle commence dès que la moitié des joueurs encore dans la maison
                    l'acceptent.
                </li>
                <li>
                    <b>🎓 Saison guidée</b> : nouveau ? Active la saison guidée à la préparation (elle est activée tant
                    que tu n'as pas fini de saison) et un coach explique chaque étape de la semaine la première fois.
                    ✨ Prépare-moi une première saison en douceur choisit pour toi une petite maison, des bots en mode
                    Détente et aucun rebondissement.
                </li>
                <li>
                    <b>🎚️ Difficulté et 📜 Règles de la maison</b> : de Détente (bots indulgents) à Impitoyable (bots
                    qui doutent de toi et trahissent leur parole). Les règles fixent la taille du jury, la
                    participation du Chef au Veto, les grandes semaines à trois nominés, les actions par moment social
                    et les types d'épreuves possibles.
                </li>
                <li>
                    <b>🎨 Ton avatar</b> : dessine-toi trait par trait (peau, cheveux, yeux, lunettes, chapeaux…),
                    tire-en un au hasard, ou utilise une photo.
                </li>
                <li>
                    <b>🔗 Partager un casting</b> : sur l'écran du casting, 📤 Partager ce casting donne un lien qui
                    ouvre le jeu avec ton casting (noms, visages, notes et relations). 📥 Charger un casting accepte un
                    code envoyé par un ami.
                </li>
            </ul>
        ),
    },
];
