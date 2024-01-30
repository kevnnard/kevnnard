import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
    size: "w-7 h-7",
    isSolid: true,
  },
  {
    id: 2,
    title: "Linkedin",
    href: "https://www.linkedin.com/in/kevnnard/",
    icon: "LINKEDIN",
    icon2: "LINKEDIN2",
    size: "w-7 h-7",
    isSolid: true,
  },
  {
    id: 3,
    title: "Twitter",
    href: "https://twitter.com/kevnnard",
    icon: "TWITTER",
    icon2: "",
    size: "w-6 h-6",
    isSolid: true,
  },
];

export const HeaderComponent = () => {
  return (
    <header className="sticky top-0 flex justify-between items-center py-5 backdrop-blur-sm z-50">
      <Avatar>
        <AvatarImage
          src="https://github.com/kevnnard.png"
          alt="Github Kevnnard"
        />
        <AvatarFallback>Kevnnard</AvatarFallback>
      </Avatar>

      <nav>
        <TooltipProvider>
          {menuIcons.map((icon: MenuIconInterface) => (
            <Tooltip key={icon.id}>
              <a href={icon.href} target="_blank" rel="noreferrer">
                <TooltipTrigger className="m-auto p-3">
                  <SvgComponentGlobal
                    className={`${icon.size}`}
                    icon={icon.icon}
                    icon2={icon.icon2}
                    fill="#545454"
                    strokeWidth={1}
                    isSolid={icon.isSolid}
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center">
                  <p>{icon.title}</p>
                </TooltipContent>
              </a>
            </Tooltip>
          ))}
        </TooltipProvider>
      </nav>
    </header>
  );
};
