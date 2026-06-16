import { useContext } from "react";
import { SocketContext } from "../context/SocketContext";

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket doit être utilisé à l'intérieur de SocketProvider");
  }
  return context;
};
