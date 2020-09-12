import React from "react";
import { ObservableSocket } from "../../signals/ObservableSocket";
import { Container } from "semantic-ui-react";

interface Props {
    container: ObservableSocket<HTMLDivElement | null>
}

export class GameScreenComponent extends React.PureComponent<Props> {
    private game_screen_container = React.createRef<HTMLDivElement>();

    public componentDidMount() {
        this.props.container.set(this.game_screen_container.current);
    }

    public componentWillUnmount() {
        this.props.container.set(null);
    }

    render() {
        return (
            <Container>
                <div id="game-screen" ref={this.game_screen_container}
                    style={{
                        justifyContent: "center",
                        alignItems: "center",
                        display: "flex"
                    }
                    } />
            </Container>
        );
    }
}