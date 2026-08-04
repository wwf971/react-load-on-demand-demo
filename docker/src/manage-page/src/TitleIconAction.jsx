import { SpinningCircle } from '@wwf971/react-comp-misc'
import ControlIconItem from './ControlIconItem.jsx'

const TitleIconAction = ({ title, isLoading = false, isDisabled = false, onClick, icon }) => {
  return (
    <ControlIconItem
      title={title}
      isDisabled={isDisabled || isLoading}
      isIconOnly
      onClick={onClick}
    >
      {isLoading ? <SpinningCircle width={14} height={14} /> : icon}
    </ControlIconItem>
  )
}

export default TitleIconAction
