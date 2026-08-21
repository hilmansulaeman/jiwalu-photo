import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartColumn,
  faCamera,
  faCheck,
  faDownload,
  faPen,
  faFilter,
  faGlobe,
  faImage,
  faTableCellsLarge,
  faLock,
  faDesktop,
  faPlus,
  faPowerOff,
  faPrint,
  faFloppyDisk,
  faMagnifyingGlass,
  faGear,
  faStar,
  faTrash,
  faWallet,
  faXmark,
  faGrip,
  faList,
  faChevronDown,
  faFile,
  faWandMagicSparkles,
  faCloudArrowUp,
  faArrowLeft
} from '@fortawesome/free-solid-svg-icons';

const FAIcon = ({ icon, size, color, className }) => {
  const style = {};
  if (size) style.fontSize = size;
  if (color) style.color = color;
  return <FontAwesomeIcon icon={icon} className={`flex-shrink-0 ${className || ''}`} style={style} />;
};

export const BarChart3 = (p) => <FAIcon icon={faChartColumn} {...p} />;
export const Camera = (p) => <FAIcon icon={faCamera} {...p} />;
export const Check = (p) => <FAIcon icon={faCheck} {...p} />;
export const Download = (p) => <FAIcon icon={faDownload} {...p} />;
export const Edit = (p) => <FAIcon icon={faPen} {...p} />;
export const Filter = (p) => <FAIcon icon={faFilter} {...p} />;
export const Globe = (p) => <FAIcon icon={faGlobe} {...p} />;
export const Image = (p) => <FAIcon icon={faImage} {...p} />;
export const ImageIcon = (p) => <FAIcon icon={faImage} {...p} />;
export const LayoutTemplate = (p) => <FAIcon icon={faTableCellsLarge} {...p} />;
export const Lock = (p) => <FAIcon icon={faLock} {...p} />;
export const MonitorPlay = (p) => <FAIcon icon={faDesktop} {...p} />;
export const Plus = (p) => <FAIcon icon={faPlus} {...p} />;
export const Power = (p) => <FAIcon icon={faPowerOff} {...p} />;
export const Printer = (p) => <FAIcon icon={faPrint} {...p} />;
export const PrinterIcon = (p) => <FAIcon icon={faPrint} {...p} />;
export const Save = (p) => <FAIcon icon={faFloppyDisk} {...p} />;
export const Search = (p) => <FAIcon icon={faMagnifyingGlass} {...p} />;
export const Settings = (p) => <FAIcon icon={faGear} {...p} />;
export const Star = (p) => <FAIcon icon={faStar} {...p} />;
export const Trash2 = (p) => <FAIcon icon={faTrash} {...p} />;
export const WalletCards = (p) => <FAIcon icon={faWallet} {...p} />;
export const X = (p) => <FAIcon icon={faXmark} {...p} />;
export const Grid = (p) => <FAIcon icon={faGrip} {...p} />;
export const List = (p) => <FAIcon icon={faList} {...p} />;
export const ChevronDown = (p) => <FAIcon icon={faChevronDown} {...p} />;
export const File = (p) => <FAIcon icon={faFile} {...p} />;
export const Wand2 = (p) => <FAIcon icon={faWandMagicSparkles} {...p} />;
export const UploadCloud = (p) => <FAIcon icon={faCloudArrowUp} {...p} />;
export const ArrowLeft = (p) => <FAIcon icon={faArrowLeft} {...p} />;
