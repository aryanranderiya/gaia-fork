import { Text, Box } from "ink";
import Gradient from "ink-gradient";
import BigText from "ink-big-text";

export default function App() {
  return (
    <Box flexDirection="column" padding={1}>
      <Gradient
        colors={["#00bbff", "#b0eaff", "#00bbff"]}
      >
        <BigText text="GAIA" font="3d" />
      </Gradient>
      <Text bold>Welcome to the GAIA Command Line Interface!</Text>
    </Box>
  );
}
