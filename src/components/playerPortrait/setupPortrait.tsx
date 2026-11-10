import React from "react";
import styled from "styled-components";
import { selectedColor } from "./houseguestPortraitController";
import { clampStat, MAX_STAT, MIN_STAT } from "../../model/playerProfile";

const EditPortrait = styled.div`
    padding: 5px;
    margin: 5px;
    border: 1px solid #9d9d9d;
    background-color: #9d9d9d;
    color: black;
    border-radius: 5px;
    font-weight: 600;
    width: 7rem;
    word-wrap: break-word;
`;

export const unselectable = `   -webkit-touch-callout: none;
-webkit-user-select: none;
-khtml-user-select: none;
-moz-user-select: none;
-ms-user-select: none;
user-select: none;`;

export const Noselect = styled.div`
    ${unselectable}
`;

export const PencilEmoji = "✎";

const XButton = styled(Noselect)`
    color: #300808;
    width: 50%;

    :active {
        color: #ff7133;
        background-color: #ffd8c7;
    }
    :hover {
        color: red;
        background-color: #ffe1ea;
    }
`;

const EditButton = styled(Noselect)`
    color: #300808;
    width: 50%;

    :active {
        color: #ff7133;
        background-color: #ffd8c7;
    }
    :hover {
        color: orange;
        background-color: #fff6e1;
    }
`;

const StatRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
    margin-top: 2px;
`;

const StatInput = styled.input`
    width: 3em;
    font-size: 0.8rem;
    text-align: center;
    border: 1px solid #6d6d6d;
    border-radius: 3px;
`;

interface StatFieldProps {
    label: string;
    title: string;
    value: number;
    onChange: (n: number) => void;
}

function StatField(props: StatFieldProps) {
    return (
        <StatRow title={props.title}>
            <span>{props.label}</span>
            <StatInput
                type="number"
                min={MIN_STAT}
                max={MAX_STAT}
                value={props.value}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => props.onChange(clampStat(parseInt(event.target.value)))}
            />
        </StatRow>
    );
}

interface SetupPortraitProps {
    name: string;
    imageUrl: string;
    onDelete: () => void;
    onRename: () => void;
    onClick: () => void;
    selected: boolean;
    social: number;
    comp: number;
    onStatChange: (stat: "social" | "comp", value: number) => void;
}

interface SetupPortraitState {
    name: string;
}

export class SetupPortrait extends React.Component<SetupPortraitProps, SetupPortraitState> {
    public constructor(props: SetupPortraitProps) {
        super(props);
        this.state = { name: props.name };
    }

    public UNSAFE_componentWillReceiveProps(props: SetupPortraitProps) {
        this.setState({ name: props.name });
    }

    public render() {
        const style = this.props.selected ? { backgroundColor: selectedColor.toHex() } : {};
        return (
            <EditPortrait onClick={() => this.props.onClick()} style={style}>
                <div style={{ textAlign: "center" }}>
                    <div style={{ maxHeight: 20, display: "flex" }}>
                        <XButton
                            onDoubleClick={() => this.props.onDelete()}
                            onClick={(event) => event.stopPropagation()}
                        >
                            ✘
                        </XButton>
                        <EditButton
                            onClick={(event) => {
                                event.stopPropagation();
                                this.props.onRename();
                            }}
                        >
                            {PencilEmoji}
                        </EditButton>
                    </div>
                    <img src={this.props.imageUrl} style={{ width: 100, height: 100 }} alt="" />
                    <br />
                    <p>{this.state.name}</p>
                    <StatField
                        label="Social"
                        title={`Social (${MIN_STAT}-${MAX_STAT}): higher means other houseguests like them more`}
                        value={this.props.social}
                        onChange={(n) => this.props.onStatChange("social", n)}
                    />
                    <StatField
                        label="Comp"
                        title={`Comp (${MIN_STAT}-${MAX_STAT}): higher means they win more competitions`}
                        value={this.props.comp}
                        onChange={(n) => this.props.onStatChange("comp", n)}
                    />
                </div>
            </EditPortrait>
        );
    }
}
