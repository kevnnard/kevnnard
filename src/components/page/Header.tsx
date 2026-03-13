import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SvgComponentGlobal } from "./SvgIcons";

type MenuIconInterface = {
  id?: number;
  title: string;
  href: string;
  icon: string;
  icon2?: string;
  size?: string | undefined;
  isSolid?: boolean;
};

const menuIcons: MenuIconInterface[] = [
  {
    id: 1,
    title: "Github",
    href: "https://github.com/kevnnard",
    icon: "GITHUB",
    icon2: "",
    size: "w-5 h-5",
    isSolid: true,
  },
  {
    id: 2,
    title: "Linkedin",
    href: "https://www.linkedin.com/in/kevnnard/",
    icon: "LINKEDIN",
    icon2: "LINKEDIN2",
    size: "w-5 h-5",
    isSolid: true,
  },
  {
    id: 3,
    title: "X",
    href: "https://twitter.com/kevnnard",
    icon: "TWITTER",
    icon2: "",
    size: "w-4 h-4",
    isSolid: true,
  },
];

export const HeaderComponent = () => {
  return (
    <header className="sticky top-0 flex justify-between items-center py-4 backdrop-blur-md z-50 border-b border-white/[0.04]">
      <a href="/" className="group flex items-center gap-3">
        <Avatar className="w-9 h-9 border border-white/[0.08] transition-all group-hover:border-emerald-500/30">
          <AvatarImage src="https://github.com/kevnnard.png" alt="Kevnnard" />
          <AvatarFallback className="bg-emerald-500/10 text-emerald-400 text-xs">
            KV
          </AvatarFallback>
        </Avatar>
        <span className="hidden sm:block text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          kevnnard
        </span>
      </a>

      <nav className="flex items-center gap-1">
        <TooltipProvider delayDuration={100}>
          {menuIcons.map((icon: MenuIconInterface) => (
            <Tooltip key={icon.id}>
              <TooltipTrigger asChild>
                <a
                  href={icon.href}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2.5 rounded-lg text-muted-foreground transition-all hover:bg-white/[0.04] hover:text-foreground"
                >
                  <SvgComponentGlobal
                    className={`${icon.size}`}
                    icon={icon.icon}
                    icon2={icon.icon2}
                    strokeWidth={1.5}
                    isSolid={icon.isSolid}
                  />
                </a>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="center"
                className="bg-card/90 backdrop-blur-sm border-white/[0.08] text-xs"
              >
                {icon.title}
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </nav>
    </header>
  );
};
