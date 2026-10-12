import { BackgroundBlur } from "../BackgroundBlur/BackgroundBlur";
import { BottomNav } from "../BottomNav/BottomNav";
import { isKioskMode } from "../../constants/app";
import s from "./Layout.module.css";
import { useLocation } from "react-router-dom";

export const Layout = ({ children }: { children: React.ReactNode }) => {
    const pathname = useLocation().pathname;
    const hideNav = pathname === '/game' || pathname.startsWith('/game/');

    return (
        <>
            <BackgroundBlur />
            <div className={`${s.layout}${isKioskMode() ? ` ${s.kiosk}` : ''}`}>
                {children}
                {!hideNav && <BottomNav />}
            </div>
        </>
    );
};
