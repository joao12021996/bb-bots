import React from "react";
import { CartoonLook, cartoonURL, LOOK_PARTS, lookFromURL, lookOf, randomLook, unlockFor, UNLOCKS } from "../../cartoon/cartoon";
import { ACHIEVEMENTS, loadCareer } from "../../career/career";

// The options there are to earn, and whether this device's player has earned them.
function useUnlocked(): (achievement: string) => boolean {
    const [unlocked] = React.useState(() => loadCareer().unlocked);
    return (achievement: string) => !!unlocked[achievement];
}

export interface Look {
    name: string;
    imageURL: string;
}

// Build your own cartoon avatar, one feature at a time: skin, face, hair, eyes, glasses and the rest, with a
// shuffle for a random start. Or use your own photo.
export function AvatarBuilder(props: { look: CartoonLook; onChange: (look: CartoonLook) => void }) {
    const { look } = props;
    const has = useUnlocked();
    const open = (key: keyof CartoonLook, index: number) => {
        const needs = unlockFor(key, index);
        return !needs || has(needs);
    };
    // on to the next option the player can wear (the ones still to earn are skipped)
    const step = (key: keyof CartoonLook, by: number) => {
        const count = LOOK_PARTS.find((p) => p.key === key)!.options.length;
        let next = look[key];
        for (let i = 0; i < count; i++) {
            next = (next + by + count) % count;
            if (open(key, next)) break;
        }
        props.onChange({ ...look, [key]: next });
    };
    const toEarn = UNLOCKS.filter((u) => !has(u.achievement));
    return (
        <div className="bbb-avatar-parts">
            {LOOK_PARTS.map((part) => (
                <div key={part.key} className="bbb-avatar-part">
                    <span className="bbb-avatar-label">{part.label}</span>
                    <button type="button" className="button is-small is-light" aria-label={`Previous ${part.label}`} onClick={() => step(part.key, -1)}>
                        ‹
                    </button>
                    <span className="bbb-avatar-value">{part.options[look[part.key]]}</span>
                    <button type="button" className="button is-small is-light" aria-label={`Next ${part.label}`} onClick={() => step(part.key, 1)}>
                        ›
                    </button>
                </div>
            ))}
            {UNLOCKS.length > 0 && (
                <div className="bbb-avatar-unlocks">
                    {toEarn.length === 0 ? (
                        <small className="bbb-subtle">🎁 You've earned every hat and extra there is.</small>
                    ) : (
                        <>
                            <small className="bbb-subtle">🔒 {toEarn.length} more to earn:</small>
                            {toEarn.map((u) => {
                                const part = LOOK_PARTS.find((p) => p.key === u.part)!;
                                const a = ACHIEVEMENTS.find((x) => x.id === u.achievement);
                                return (
                                    <small key={`${u.part}-${u.index}`} className="bbb-subtle" title={a ? a.how : undefined}>
                                        <b>{part.options[u.index]}</b>: {a ? `${a.emoji} ${a.title} (${a.how.replace(/\.$/, "")})` : u.achievement}
                                    </small>
                                );
                            })}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export function FaceEditor(props: { original: Look; current: Look; onSave: (look: Look) => void; onCancel: () => void }) {
    const [name, setName] = React.useState(props.current.name);
    const [look, setLook] = React.useState<CartoonLook>(() => lookFromURL(props.current.imageURL) || lookOf(props.current));
    // a photo of their own, if they'd rather (it was one already, or they upload one)
    const startPhoto = !lookFromURL(props.current.imageURL) && props.current.imageURL ? props.current.imageURL : null;
    const [photo, setPhoto] = React.useState<string | null>(startPhoto);
    const [usePhoto, setUsePhoto] = React.useState(!!startPhoto);

    const trimmed = name.trim() || props.original.name;
    const selected = usePhoto && photo ? photo : cartoonURL(look);
    const edit = (next: CartoonLook) => {
        setLook(next);
        setUsePhoto(false);
    };

    return (
        <div className="bbb-card-box bbb-face-editor">
            <div className="bbb-card-title">✏️ Your name and avatar</div>
            <div className="bbb-face-editor-top">
                <img src={selected} alt="" />
                <div className="bbb-face-editor-side">
                    <input className="input" type="text" maxLength={24} value={name} placeholder="Your name" onChange={(e) => setName(e.target.value)} />
                    <div className="bbb-face-editor-tools">
                        <button type="button" className="button is-small is-link is-light" onClick={() => edit(randomLook(Math.random))}>
                            🎲 Random
                        </button>
                        <label className="button is-small is-light" title="Use a photo instead">
                            📷 Photo
                            <input
                                type="file"
                                accept="image/*"
                                style={{ display: "none" }}
                                onChange={(e) => {
                                    const file = e.target.files && e.target.files[0];
                                    if (!file) return;
                                    setPhoto(URL.createObjectURL(file));
                                    setUsePhoto(true);
                                }}
                            />
                        </label>
                        {photo && (
                            <button type="button" className="button is-small is-light" onClick={() => setUsePhoto(!usePhoto)}>
                                {usePhoto ? "🎨 Use the cartoon" : "📷 Use the photo"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <AvatarBuilder look={look} onChange={edit} />
            <div>
                <button type="button" className="button is-success" onClick={() => props.onSave({ name: trimmed, imageURL: selected })}>
                    Save
                </button>{" "}
                <button type="button" className="button is-light" onClick={props.onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
