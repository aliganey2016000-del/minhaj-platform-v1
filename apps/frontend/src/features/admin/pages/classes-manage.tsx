import { ClassesManage as BaseClassesManage } from './classes-manage-base';
import { SchoolPromotionLauncher } from './components/school-promotion-workflow';

export function ClassesManage() {
  return <>
    <BaseClassesManage />
    <SchoolPromotionLauncher />
  </>;
}

export default ClassesManage;
