import React from "react";
import { AVATAR_EMOJIS, emojiAvatar, initialsAvatar } from "./avatar";

export interface Look {
    name: string;
    imageURL: string;
}

// Pick your name and face: the original portrait (cast members), initials, an emoji face, or your own photo.
export function FaceEditor(props: { original: Look; current: Look; onSave: (look: Look) => void; onCancel: () => void }) {
    const [name, setName] = React.useState(props.current.name);
    // "initials" follows the name as you type; anything else is an image URL
    const [choice, setChoice] = React.useState(() =>
        props.current.imageURL === initialsAvatar(props.current.name) ? "initials" : props.current.imageURL
    );
    const [photo, setPhoto] = React.useState<string | null>(null);

    const trimmed = name.trim() || props.original.name;
    const resolve = (c: string) => (c === "initials" ? initialsAvatar(trimmed) : c);
    const choices: string[] = [];
    if (props.original.imageURL && !props.original.imageURL.startsWith("data:image/svg")) choices.push(props.original.imageURL);
    if (photo) choices.push(photo);
    choices.push("initials");
    AVATAR_EMOJIS.forEach((e, i) => choices.push(emojiAvatar(e, (i * 47) % 360)));
    if (!choices.includes(choice)) choices.unshift(choice);
    const unique = Array.from(new Set(choices));
    const selected = resolve(choice);

    return (
        <div className="bbb-card-box bbb-face-editor">
            <div className="bbb-card-title">✏️ Your name and face</div>
            <div className="bbb-face-editor-top">
                <img src={selected} alt="" />
                <input
                    className="input"
                    type="text"
                    maxLength={24}
                    value={name}
                    placeholder="Your name"
                    onChange={(e) => setName(e.target.value)}
                />
            </div>
            <div className="bbb-face-options">
                {unique.map((c) => (
                    <button key={c} type="button" className={c === choice ? "is-selected" : ""} onClick={() => setChoice(c)}>
                        <img src={resolve(c)} alt="" />
                    </button>
                ))}
                <label className="bbb-face-upload" title="Upload a photo">
                    📷
                    <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                            const file = e.target.files && e.target.files[0];
                            if (!file) return;
                            const url = URL.createObjectURL(file);
                            setPhoto(url);
                            setChoice(url);
                        }}
                    />
                </label>
            </div>
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
