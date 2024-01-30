import { IconsCatalog } from "@/enums/IconSVG.enum";

interface Icon {
  icon: keyof typeof IconsCatalog | string;
  icon2?: keyof typeof IconsCatalog | string | undefined;

  fill?: string;
  isSolid?: boolean;
  strokeWidth?: number;
  className?: string;
}

export const SvgComponentGlobal = ({
  icon = "HELP",
  icon2 = "",
  fill,
  isSolid = false,
  strokeWidth = 1.5,
  className,
}: Icon) => {
  const clases = !isSolid ? `${className} fill-transparent` : className;
  return (
    <svg
      data-testid="Icon"
      className={clases}
      stroke={isSolid ? undefined : "currentColor"}
      color={fill}
      fill={isSolid ? "currentColor" : undefined}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      strokeWidth={strokeWidth}
      focusable="false"
      aria-hidden="true"
    >
      {IconsCatalog[icon as keyof typeof IconsCatalog] && (
        <>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d={IconsCatalog[icon as keyof typeof IconsCatalog]}
          />

          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d={IconsCatalog[icon2 as keyof typeof IconsCatalog]}
          />
        </>
      )}
    </svg>
  );
};
